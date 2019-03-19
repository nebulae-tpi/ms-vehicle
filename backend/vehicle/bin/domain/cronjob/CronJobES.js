"use strict";

const { of, forkJoin } = require("rxjs");
const { mergeMap, delay, tap } = require("rxjs/operators");
const Event = require("@nebulae/event-store").Event;
const eventSourcing = require("../../tools/EventSourcing")();
const MATERIALIZED_VIEW_TOPIC = "emi-gateway-materialized-view-updates";
const VehicleBlocksDA = require('../../data/VehicleBlocksDA');

/**
 * Singleton instance
 */
let instance;

class CronJobES {
  constructor() {
    
    // of({})
    // .pipe(
    //   delay(3000),
    //   mergeMap( () => this.generateEventStoreEvent$('PeriodicFiveMinutes', 1, 'Cronjob', 1, {})),
    //   mergeMap(event => eventSourcing.eventStore.emitEvent$(event)),
    //   tap(x => console.log('ENVIADO'))
    // )
    // .subscribe()

  }

  handlePeriodicFiveMinutes$() {
    return forkJoin(
      this.searchExpiredBlocksToRemove$()
    )
  }

  searchExpiredBlocksToRemove$(){
    return VehicleBlocksDA.findAllExpiredBlocks$(Date.now())
    .pipe(
      mergeMap(block => this.generateEventStoreEvent$('VehicleBlockRemoved', 1, 'Vehicle', block.vehicleId, {
        blockKey: block.key
      }, 'SYSTEM')),
      mergeMap(event => eventSourcing.eventStore.emitEvent$(event))
    )
  }


  

  generateEventStoreEvent$(eventType, eventVersion, aggregateType, aggregateId, data, user) {
    return of(new Event({
      eventType: eventType,
      eventTypeVersion: eventVersion,
      aggregateType: aggregateType,
      aggregateId: aggregateId,
      data: data,
      user: user
    }))
  }

}

/**
 * @returns {CronJobES}
 */
module.exports = () => {
  if (!instance) {
    instance = new CronJobES();
    console.log(`${instance.constructor.name} Singleton created`);
  }
  return instance;
};
