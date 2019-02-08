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

        of({}).pipe(
          delay(3000),
          mergeMap(() => interval(2000)),
          take(1),
          tap(() => console.log("SIMULANDO EVENTO DEL CRONJOB")),
          mergeMap(() =>
            eventSourcing.eventStore.emitEvent$(
              new Event({
                eventType: "PicoYPlacaBlocksRuleEmitted",
                eventTypeVersion: 1,
                aggregateType: "Cronjob",
                aggregateId: 1,
                data: { 
                    buIds: ["7y6t-3er4-t5y6u7-u7i8", "23we-34er-we23-45rt-67ty"],
                    licensePlateMap: { 0: " 0  ,1", 1: "2,3", 2: "4,5", 3: "6,7", 4: "8,9" },
                 },
                user: "SYSTEM"
              })
            )
          ),
          delay(5000),
        //   mergeMap(() =>
        //     eventSourcing.eventStore.emitEvent$(
        //       new Event({
        //         eventType: "PicoYPlacaUnblocksRuleEmitted",
        //         eventTypeVersion: 1,
        //         aggregateType: "Cronjob",
        //         aggregateId: 1,
        //         data: { 
        //             buIds: ["7y6t-3er4-t5y6u7-u7i8", "23we-34er-we23-45rt-67ty"],
        //             licensePlateMap: { 0: " 0  ,1", 1: "2,3", 2: "4,5", 3: "6,7", 4: " 8 ,  9   " },
        //          },
        //         user: "SYSTEM"
        //       })
        //     )
        //   )

        )

        .subscribe(() => {}, e => console.log(e), () => {});
        

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

    handlePicoYPlacaBlocksRuleEmitted$(pypBlocksRuleEmittedEvt){
        console.log("!!!!!!!!!!!!!!!!!!!!!! pypBlocksRuleEmittedEvt !!!!!!!!!!!!!!!!!!!!!!!");
        return of(pypBlocksRuleEmittedEvt.data)
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
            mergeMap(platesKey =>  VehicleDA.getVehicleListToAplyPYP_Blocks$( pypBlocksRuleEmittedEvt.data.buIds, platesKey) ),
            
            tap(vehicle => console.log("VEHICLE FOUND ==> ", JSON.stringify(vehicle))),

            mergeMap(vehicle => eventSourcing.eventStore.emitEvent$(
                new Event({
                    eventType: "VehicleBlockAdded",
                    eventTypeVersion: 1,
                    aggregateType: "Vehicle",
                    aggregateId: vehicle._id,
                    data: { 
                        blockKey: "PYP",
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

    handlePicoYPlacaUnblocksRuleEmitted$(pypUnblocksRuleEmittedEvt){
        console.log("handlePicoYPlacaUnblocksRuleEmitted !!!!!!!!!!!!!!!!!!!!!! pypUnblocksRuleEmittedEvt !!!!!!!!!!!!!!!!!!!!!");
        return of(pypUnblocksRuleEmittedEvt.data)
        .pipe(
            mergeMap(({ licensePlateMap }) => of(Crossccutting.getDayOfYear())
                .pipe(
                    map(dayOfYear => dayOfYear % 5),
                    map(dayKey => licensePlateMap[dayKey].split(",").map(e => e.trim())),
                )
            ),
            mergeMap(platesKey =>  VehicleDA.getVehicleListToAplyPYP_Blocks$( pypUnblocksRuleEmittedEvt.data.buIds, platesKey) ),
            tap(vehicle => console.log("VEHICLE FOUND ==> ", JSON.stringify(vehicle))),

            mergeMap(vehicle => eventSourcing.eventStore.emitEvent$(
                new Event({
                    eventType: "VehicleBlockRemoved",
                    eventTypeVersion: 1,
                    aggregateType: "Vehicle",
                    aggregateId: vehicle._id,
                    data: { 
                        blockKey: "PYP",
                        licensePlate: vehicle.generalInfo.licensePlate,
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