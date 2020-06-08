"use strict";

const { of, forkJoin, from } = require("rxjs");
const { mergeMap, delay, concatMap, tap, toArray, map } = require("rxjs/operators");
const Event = require("@nebulae/event-store").Event;
const eventSourcing = require("../../tools/EventSourcing")();
const MATERIALIZED_VIEW_TOPIC = "emi-gateway-materialized-view-updates";
const VehicleBlocksDA = require('../../data/VehicleBlocksDA');
const VehicleDA = require('../../data/VehicleDA');
const ACTIVE_VEHICLE_THRESHOLD = parseInt(process.env.ACTIVE_VEHICLE_THRESHOLD  || "30");
 
/**
 * Singleton instance
 */
let instance;

class CronJobES {
  constructor() {
    
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

  handleValidateInactiveVehicles$({ timestamp, data }){
    const millisOnDay = 24 * 60 * 60 * 1000;
    const { rules } = data;
    
    if(!rules){
      console.log(`${new Date().toLocaleString()} [WARNING] rules array in data field is required to search vehicles per business unit`);
      return of(null);
    }

    console.log(`[${new Date().toLocaleString()}] handleValidateInactiveVehicles$`, data);
    

    return from(rules).pipe(
      map(rule => ({ 
        businessId: rule.businessId, 
        limitTs: Date.now() - ( millisOnDay * rule.days ) 
      })),
      // tap(r => console.log(r)),
      mergeMap(({ businessId, limitTs }) => VehicleDA.findVehiclesToSetInactive$( businessId, limitTs)),
      concatMap(v => of(v).pipe(
        delay(100),
        tap(v => console.log(`DESACTIVANDO vechicle ==> BuID: ${v.businessId} -- ID: ${v._id} -- PLATE: ${v.generalInfo.licensePlate}`)),
        mergeMap(vehicle => this.generateEventStoreEvent$('VehicleStateUpdated', 1, 'Vehicle', vehicle._id, 
          { _id: vehicle._id, state: false, modifierUser: "SYSTEM", modificationTimestamp: timestamp },
          'SYSTEM'
        )),
        mergeMap(event => eventSourcing.eventStore.emitEvent$(event))
      ))
    )
  }
  
  
  searchExpiredSubscriptions$() {
    return VehicleDA.getExpiredSubscriptions$(Date.now())
      .pipe(
        mergeMap(v => forkJoin(
          of(v),
          VehicleBlocksDA.findByPlateAndKey$(v.generalInfo.licensePlate, 'SUBSCRIPTION_EXPIRED'),          
        )),
        mergeMap(([vehicle, blockExists]) => blockExists 
          ? of([null, null])
          : forkJoin(
          this.generateEventStoreEvent$("VehicleBlockAdded", 1, "Vehicle", vehicle._id,
            {
              blockKey: 'SUBSCRIPTION_EXPIRED',
              startTime: Date.now(),
              notes: 'Blocked by System CronJob'
            }, "SYSTEM"),
            VehicleDA.updateVehicleMembership$(vehicle.generalInfo.licensePlate, vehicle.subscription 
                ? { ...vehicle.subscription, status: 'INACTIVE'} : { expirationTime: 0, status: 'INACTIVE' }
            )
          )
        ),
        mergeMap(([event, a]) => event ? eventSourcing.eventStore.emitEvent$(event) : of({})),
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
