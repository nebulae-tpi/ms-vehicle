'use strict'

const { of, interval, forkJoin } = require("rxjs");
const { tap, mergeMap, catchError, map, mapTo, delay, take, toArray, filter } = require('rxjs/operators');
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


    handlePicoPlacaCaliBlockJobTriggered$(PicoPlacaCaliBlockJobTriggered){
        return of(PicoPlacaCaliBlockJobTriggered.data)
        .pipe(
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
            
            //tap(vehicle => console.log("VEHICLE FOUND TO BLOCK BY PICO_Y_PLACA ==> ", JSON.stringify(vehicle))),

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
                        startTime: Date.now(),
                        endTime: undefined                        
                    },
                    user: "SYSTEM"
                })
            )),
            toArray()            
        )
    }

    handleVehicleBlockAdded$({ aid, user, data }){
        console.log("handleVehicleBlockAdded ==> ", aid, user, data);
        return of({
            vehicleId: aid,
            user: user,
            ...data
        })
        .pipe(
            mergeMap((blockInfo) => forkJoin(
                VehicleBlocksDA.insertVehicleBlock$(blockInfo),
                VehicleDA.inserBlock$(blockInfo),
                broker.send$(MATERIALIZED_VIEW_TOPIC, 'VehicleBlockAdded',
                    { ...blockInfo, key: blockInfo.blockKey }
                )
            ))
        )        
    }

    handleVehicleBlockRemoved$(evt){
        return of({vehicleId: evt.aid, blockKey: evt.data.blockKey })
        .pipe(
            mergeMap( args => forkJoin(
                VehicleBlocksDA.removeBlock$(args),
                VehicleDA.removeBlock$(args)
            )),

        )
    }

    handlePicoPlacaCaliUnblockJobTriggered$(PicoPlacaCaliUnblockJobTriggeredEvt){
        //console.log("handlePicoYPlacaUnblocksRuleEmitted !!!!!!!!!!!!!!!!!!!!!! handlePicoPlacaCaliBlockJobTriggered !!!!!!!!!!!!!!!!!!!!!");
        return of(PicoPlacaCaliUnblockJobTriggeredEvt.data)
            .pipe(
                mergeMap(() => VehicleBlocksDA.getVehicleListToRemovePYP_Blocks$(PicoPlacaCaliUnblockJobTriggeredEvt.data.buIds)),
                //tap(vehicle => console.log("VEHICLE FOUNF TO REMOVE PICO_Y_PLACA BLOCK ==> ", JSON.stringify(vehicle))),
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

            )
    }

    handleVehicleSubscriptionPaid$({aid, data, user, timestamp}){
        console.log("handleVehicleSubscriptionPaid", data);        
        const millisInDay = 1000 * 60 * 60 * 24;
        return VehicleDA.findVehicleByLicensePlate$(data.licensePlate)
        .pipe(
            mergeMap(vehicle => forkJoin(
                of(vehicle.subscription)
                    .pipe(
                        mergeMap(vehicleMembership => {
                            return of({
                                status: 'ACTIVE',
                                expirationTime: !vehicleMembership || vehicleMembership.expirationTime < timestamp
                                    ? timestamp + (data.daysPaid * millisInDay)
                                    : vehicleMembership.expirationTime + (data.daysPaid * millisInDay)
                            });
                        }),
                        mergeMap(vehicleMembership => VehicleDA.updateVehicleMembership$(data.licensePlate, vehicleMembership))
                    ),
                eventSourcing.eventStore.emitEvent$(
                    new Event({
                      eventType: "VehicleBlockRemoved",
                      eventTypeVersion: 1,
                      aggregateType: "Vehicle",
                      aggregateId: vehicle._id,
                      data: { blockKey: "SUBSCRIPTION_EXPIRED" },
                      user: user
                    })
                  )
            )),            
        );
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