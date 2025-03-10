'use strict'

const { of, interval, forkJoin, from } = require("rxjs");
const { tap, mergeMap, catchError, map, mapTo, delay, take, toArray, filter, concatMap } = require('rxjs/operators');
const broker = require("../../tools/broker/BrokerFactory")();
const Event = require("@nebulae/event-store").Event;
const eventSourcing = require("../../tools/EventSourcing")();
const VehicleDA = require('../../data/VehicleDA');
const VehicleBlocksDA = require('../../data/VehicleBlocksDA');
const MATERIALIZED_VIEW_TOPIC = "emi-gateway-materialized-view-updates";
const Crossccutting = require("../../tools/Crosscutting");
const moment = require("moment");

/**
 * Singleton instance
 */
let instance;

class VehicleES {

    constructor() {
        
    }


    handleServiceAssigned$({aid, data, user, timestamp}){
        const { id, plate } = data.vehicle || {};
        // console.log(`HandleServiceAssigned ${JSON.stringify(data)}`);
        return VehicleDA.updateLastServiceTimestamp$(id, timestamp)
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