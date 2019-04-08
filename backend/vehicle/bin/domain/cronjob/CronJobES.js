"use strict";

const { of, forkJoin } = require("rxjs");
const { mergeMap, delay, tap, toArray } = require("rxjs/operators");
const Event = require("@nebulae/event-store").Event;
const eventSourcing = require("../../tools/EventSourcing")();
const MATERIALIZED_VIEW_TOPIC = "emi-gateway-materialized-view-updates";
const VehicleBlocksDA = require('../../data/VehicleBlocksDA');
const VehicleDA = require('../../data/VehicleDA');

/**
 * Singleton instance
 */
let instance;

class CronJobES {
  constructor() {
    
    // of({})
    // .pipe(
    //   delay(3000),
    //   mergeMap( () => this.generateEventStoreEvent$('PeriodicFifteenMinutes', 1, 'Cronjob', 1, {})),
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

  handlePeriodicFifteenMinutes$(){
    return forkJoin(
      this.searchExpiredSubscriptions$()
    )
  }
  
  
  searchExpiredSubscriptions$() {
    return VehicleDA.getExpiredSubscriptions$(Date.now())
      .pipe(
        tap(v => console.log("BLOCK BY SUBSCRIPTION  ==> ", v.generalInfo.licensePlate )),
        mergeMap(vehicle => forkJoin(
          this.generateEventStoreEvent$("VehicleBlockAdded", 1, "Vehicle", vehicle._id,
            {
              blockKey: 'SUBSCRIPTION_EXPIRED',
              startTime: Date.now(),
              notes: 'Blocked by System CronJob'
            },
            "SYSTEM"),

            VehicleDA.updateVehicleMembership$(vehicle.generalInfo.licensePlate, vehicle.subscription ? 
              { ...vehicle.subscription, status: 'INCTIVE'} : { expirationTime: 0, status: 'INCTIVE' }
              )
        )),
        mergeMap(([event, a]) => eventSourcing.eventStore.emitEvent$(event)),
        toArray(),
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
