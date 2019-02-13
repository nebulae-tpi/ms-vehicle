'use strict'

const { of, interval } = require("rxjs");
const { tap, mergeMap, catchError, map, mapTo, delay, take, toArray } = require('rxjs/operators');
const broker = require("../../tools/broker/BrokerFactory")();
const Event = require("@nebulae/event-store").Event;
const eventSourcing = require("../../tools/EventSourcing")();
const VehicleDA = require('../../data/VehicleDA');
const VehicleBlocksDA = require('../../data/VehicleBlocksDA');
const MATERIALIZED_VIEW_TOPIC = "emi-gateway-materialized-view-updates";
const Crossccutting = require("../../tools/Crosscutting");

/**
 * Singleton instance
 */
let instance;

class VehicleES {

    constructor() {
        
    }


    /**
     * Persists the vehicle on the materialized view according to the received data from the event store.
     * @param {*} businessCreatedEvent business created event
     */
    handleVehicleCreated$(vehicleCreatedEvent) {  
        const vehicle = vehicleCreatedEvent.data;
        return VehicleDA.createVehicle$(vehicle)
        .pipe(
            mergeMap(result => broker.send$(MATERIALIZED_VIEW_TOPIC, `VehicleVehicleUpdatedSubscription`, result.ops[0]))
        );
    }

        /**
     * Update the general info on the materialized view according to the received data from the event store.
     * @param {*} vehicleGeneralInfoUpdatedEvent vehicle created event
     */
    handleVehicleGeneralInfoUpdated$(vehicleGeneralInfoUpdatedEvent) {  
        const vehicleGeneralInfo = vehicleGeneralInfoUpdatedEvent.data;
        return VehicleDA.updateVehicleGeneralInfo$(vehicleGeneralInfoUpdatedEvent.aid, vehicleGeneralInfo)
        .pipe(
            mergeMap(result => broker.send$(MATERIALIZED_VIEW_TOPIC, `VehicleVehicleUpdatedSubscription`, result))
        );
    }

    /**
     * updates the state on the materialized view according to the received data from the event store.
     * @param {*} VehicleStateUpdatedEvent events that indicates the new state of the vehicle
     */
    handleVehicleStateUpdated$(VehicleStateUpdatedEvent) {          
        return VehicleDA.updateVehicleState$(VehicleStateUpdatedEvent.aid, VehicleStateUpdatedEvent.data)
        .pipe(
            mergeMap(result => broker.send$(MATERIALIZED_VIEW_TOPIC, `VehicleVehicleUpdatedSubscription`, result))
        );
    }

    handleVehicleFeaturesUpdated$(VehicleVehicleFeaturesUpdatedEvent){
        return VehicleDA.updateVehicleFeatures$(VehicleVehicleFeaturesUpdatedEvent.aid, VehicleVehicleFeaturesUpdatedEvent.data)
        .pipe(
            mergeMap(result => broker.send$(MATERIALIZED_VIEW_TOPIC, `VehicleVehicleUpdatedSubscription`, result))
        )

    }

    handleVehicleBlockRemoved$(evt){
        return of({vehicleId: evt.aid, blockKey: evt.data.blockKey })
        .pipe(
            mergeMap(args => VehicleBlocksDA.removeBlockFromDevice$(args) )
        )
    }

    handleCleanExpiredBlocks$(evt){
        console.log('############### handleCleanExpiredBlocks$', evt);
        return VehicleBlocksDA.removeExpiredBlocks$(evt.timestamp);
    }

    handlePicoPlacaCaliBlockJobTriggered$(PicoPlacaCaliBlockJobTriggered){
        console.log("!!!!!!!!!!!!!!!!!!!!!! PicoPlacaCaliBlockJobTriggered !!!!!!!!!!!!!!!!!!!!!!!");
        return of(PicoPlacaCaliBlockJobTriggered.data)
        .pipe(
            // tap(() => console.log("INSIDE PIPE")),
            mergeMap(({ licensePlateMap }) => of(Crossccutting.getDayOfYear())
                .pipe(
                    // tap(dyo => console.log("DIA DEL AÑO ==> ", dyo)),
                    map(dayOfYear => dayOfYear % 5),
                    // tap(dyo => console.log("DIA DEL AÑO MODULADO ==> ", dyo)),
                    map(dayKey => licensePlateMap[dayKey].split(",").map(e => e.trim())),
                    // tap(dyo => console.log("PLACAS A BLOQUEAR ==> ", dyo)),
                )
            ),
            mergeMap(platesKey =>  VehicleDA.getVehicleListToAplyPYP_Blocks$( PicoPlacaCaliBlockJobTriggered.data.buIds, platesKey) ),
            
            tap(vehicle => console.log("VEHICLE FOUND TO BLOCK BY PICO_Y_PLACA ==> ", JSON.stringify(vehicle))),

            mergeMap(vehicle => eventSourcing.eventStore.emitEvent$(
                new Event({
                    eventType: "VehicleBlockAdded",
                    eventTypeVersion: 1,
                    aggregateType: "Vehicle",
                    aggregateId: vehicle._id,
                    data: { 
                        blockKey: "PICO_Y_PLACA",
                        businessId: vehicle.businessId,
                        licensePlate: vehicle.generalInfo.licensePlate,
                        notes: "Blocked by CronJob",
                        endTime: undefined                        
                    },
                    user: "SYSTEM"
                })
            )),
            toArray(),
            tap(() => console.log("END ==> ")),
            
        )
    }

    handleVehicleBlockAdded$(blockAppliedEvent){       
        return of({
            vehicleId: blockAppliedEvent.aid,
            user: blockAppliedEvent.user,
            ...blockAppliedEvent.data
        })
        .pipe(
            mergeMap(blockInfo => VehicleBlocksDA.insertVehicleBlock$(blockInfo) 
            )
        )        
    }

    handlePicoPlacaCaliUnblockJobTriggered$(PicoPlacaCaliUnblockJobTriggeredEvt){
        console.log("handlePicoYPlacaUnblocksRuleEmitted !!!!!!!!!!!!!!!!!!!!!! handlePicoPlacaCaliBlockJobTriggered !!!!!!!!!!!!!!!!!!!!!");
        return of(PicoPlacaCaliUnblockJobTriggeredEvt.data)
            .pipe(
                mergeMap(() => VehicleBlocksDA.getVehicleListToRemovePYP_Blocks$(PicoPlacaCaliUnblockJobTriggeredEvt.data.buIds)),
                tap(vehicle => console.log("VEHICLE FOUNF TO REMOVE PICO_Y_PLACA BLOCK ==> ", JSON.stringify(vehicle))),
                mergeMap(vehicle => eventSourcing.eventStore.emitEvent$(
                    new Event({
                        eventType: "VehicleBlockRemoved",
                        eventTypeVersion: 1,
                        aggregateType: "Vehicle",
                        aggregateId: vehicle.vehicleId,
                        data: {
                            blockKey: "PICO_Y_PLACA",
                            licensePlate: vehicle.licensePlate,
                            notes: "Unblocked by CronJob"
                        },
                        user: "SYSTEM"
                    })
                )),
                toArray(),
                tap(() => console.log("END ==> ")),

            )
    }

}



/**
 * @returns {VehicleES}
 */
module.exports = () => {
    if (!instance) {
        instance = new VehicleES();
        console.log(`${instance.constructor.name} Singleton created`);
    }
    return instance;
};