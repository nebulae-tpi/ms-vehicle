'use strict'

const { of } = require("rxjs");
const { tap, mergeMap, catchError, map, mapTo } = require('rxjs/operators');
const broker = require("../../tools/broker/BrokerFactory")();
const VehicleDA = require('../../data/VehicleDA');
const VehicleBlocksDA = require('../../data/VehicleBlocksDA');
const MATERIALIZED_VIEW_TOPIC = "emi-gateway-materialized-view-updates";

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
        console.log('############### handleVehicleBlockRemoved', evt);
        return of(evt)
        .pipe(
            map(() => ({vehicleId: evt.aid, blockKey: evt.data.blockKey }) ),
            mergeMap(args => VehicleBlocksDA.removeBlockFromDevice$(args) ),
            tap(r => console.log(r.result))
        )
    }

    handleCleanExpiredBlocks$(evt){
        console.log('############### handleCleanExpiredBlocks$', evt);
        return VehicleBlocksDA.removeExpiredBlocks$(evt.timestamp);
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