"use strict";
const { of, from, concat } = require("rxjs");
const eventSourcing = require("../../tools/EventSourcing")();
const { VehicleES } = require("../../domain/vehicle");
const { CronJobES } = require("../../domain/cronjob");
const { ServiceES } =  require("../../domain/service");
const { map, switchMap, filter, mergeMap, concatMap } = require('rxjs/operators');
/**
 * Singleton instance
 */
let instance;
/**
 * Micro-BackEnd key
 */
const mbeKey = "ms-vehicle_mbe_vehicle";

class EventStoreService {
  constructor() {
    this.functionMap = this.generateFunctionMap();
    this.subscriptions = [];
    this.aggregateEventsArray = this.generateAggregateEventsArray();
  }

  /**
   * Starts listening to the EventStore
   * Returns observable that resolves to each subscribe agregate/event
   *    emit value: { aggregateType, eventType, handlerName}
   */
  start$() {
    //default error handler
    const onErrorHandler = error => {
      console.error("Error handling  EventStore incoming event", error);
      process.exit(1);
    };
    //default onComplete handler
    const onCompleteHandler = () => {
      () => console.log("EventStore incoming event subscription completed");
    };
    console.log("EventStoreService starting ...");

    return from(this.aggregateEventsArray).pipe(
      map(aggregateEvent => ({ ...aggregateEvent, onErrorHandler, onCompleteHandler })),
      map(params => this.subscribeEventHandler(params))
    );      
  }

  /**
   * Stops listening to the Event store
   * Returns observable that resolves to each unsubscribed subscription as string
   */
  stop$() {
    return from(this.subscriptions).pipe(
      map(subscription => {
        subscription.subscription.unsubscribe();
        return `Unsubscribed: aggregateType=${aggregateType}, eventType=${eventType}, handlerName=${handlerName}`;
      })
    );
  }

  /**
     * Create a subscrition to the event store and returns the subscription info     
     * @param {{aggregateType, eventType, onErrorHandler, onCompleteHandler}} params
     * @return { aggregateType, eventType, handlerName  }
     */
  subscribeEventHandler({ aggregateType, eventType, onErrorHandler, onCompleteHandler }) {
    const handler = this.functionMap[eventType];
    const subscription =
      //MANDATORY:  AVOIDS ACK REGISTRY DUPLICATIONS
      eventSourcing.eventStore.ensureAcknowledgeRegistry$(aggregateType,mbeKey).pipe(
        mergeMap(() => eventSourcing.eventStore.getEventListener$(aggregateType, mbeKey, false)),
        filter(evt => evt.et === eventType),
        mergeMap(evt => concat(
          handler.fn.call(handler.obj, evt),
          //MANDATORY:  ACKWOWLEDGE THIS EVENT WAS PROCESSED
          eventSourcing.eventStore.acknowledgeEvent$(evt, mbeKey),
        ))
      )
        .subscribe(
          (evt) => {
            // console.log(`EventStoreService: ${eventType} process: ${evt}`);
          },
          onErrorHandler,
          onCompleteHandler
        );
    this.subscriptions.push({ aggregateType, eventType, handlerName: handler.fn.name, subscription });
    return { aggregateType, eventType, handlerName: `${handler.obj.name}.${handler.fn.name}` };
  }

  /**
  * Starts listening to the EventStore
  * Returns observable that resolves to each subscribe agregate/event
  *    emit value: { aggregateType, eventType, handlerName}
  */
  syncState$() {
    return from(this.aggregateEventsArray).pipe(
      concatMap(params => this.subscribeEventRetrieval$(params))
    )
  }


  /**
   * Create a subscrition to the event store and returns the subscription info     
   * @param {{aggregateType, eventType, onErrorHandler, onCompleteHandler}} params
   * @return { aggregateType, eventType, handlerName  }
   */
  subscribeEventRetrieval$({ aggregateType, eventType }) {
    const handler = this.functionMap[eventType];
    //MANDATORY:  AVOIDS ACK REGISTRY DUPLICATIONS
    return eventSourcing.eventStore.ensureAcknowledgeRegistry$(aggregateType,mbeKey).pipe(
      switchMap(() => eventSourcing.eventStore.retrieveUnacknowledgedEvents$(aggregateType, mbeKey)),
      filter(evt => evt.et === eventType),
      concatMap(evt => concat(
        handler.fn.call(handler.obj, evt),
        //MANDATORY:  ACKWOWLEDGE THIS EVENT WAS PROCESSED
        eventSourcing.eventStore.acknowledgeEvent$(evt, mbeKey)
      ))
    );
  }

  ////////////////////////////////////////////////////////////////////////////////////////
  /////////////////// CONFIG SECTION, ASSOC EVENTS AND PROCESSORS BELOW     //////////////
  ////////////////////////////////////////////////////////////////////////////////////////

  generateFunctionMap() {
    return {
      // Vehicle
      VehicleCreated: {
        fn: VehicleES.handleVehicleCreated$,
        obj: VehicleES
      },
      VehicleGeneralInfoUpdated: {
        fn: VehicleES.handleVehicleGeneralInfoUpdated$,
        obj: VehicleES
      },
      VehicleStateUpdated: {
        fn: VehicleES.handleVehicleStateUpdated$,
        obj: VehicleES
      },
      VehicleFeaturesUpdated: {
        fn: VehicleES.handleVehicleFeaturesUpdated$,
        obj: VehicleES
      },          
      VehicleBlockAdded: {
        fn: VehicleES.handleVehicleBlockAdded$,
        obj: VehicleES
      },
      VehicleBlockRemoved: {
        fn: VehicleES.handleVehicleBlockRemoved$,
        obj: VehicleES
      },
      PicoPlacaCaliBlockJobTriggered: {
        fn: VehicleES.handlePicoPlacaCaliBlockJobTriggered$,
        obj: VehicleES
      },
      PicoPlacaCaliUnblockJobTriggered: {
        fn: VehicleES.handlePicoPlacaCaliUnblockJobTriggered$,
        obj: VehicleES
      },
      VehicleSubscriptionPaid: {
        fn: VehicleES.handleVehicleSubscriptionPaid$,
        obj: VehicleES
      },
      VehicleSubscriptionTrialApplied: {
        fn: VehicleES.handleVehicleSubscriptionTrialApplied$,
        obj: VehicleES
      },
      VehicleSubscriptionTransferred: {
        fn: VehicleES.handleVehicleSubscriptionTransferred$,
        obj: VehicleES
      },
      VehicleSubscriptionTypeUpdated: {
        fn: VehicleES.handleVehicleSubscriptionTypeUpdated$,
        obj: VehicleES
      },
      // cronjob
      PeriodicFiveMinutes: {
        fn: CronJobES.handlePeriodicFiveMinutes$,
        obj: CronJobES
      },
      PeriodicFifteenMinutes: {
        fn: CronJobES.handlePeriodicFifteenMinutes$,
        obj: CronJobES
      },
      ValidateInactiveVehicles: {
        fn: CronJobES.handleValidateInactiveVehicles$,
        obj: CronJobES
      },
      // Service
      ServiceAssigned: {
        fn: ServiceES.handleServiceAssigned$,
        obj: ServiceES
      }
    };
  }
  /**
  * Generates a map that assocs each AggretateType withs its events
  */
  generateAggregateEventsArray() {
    return [
      // Vehicle
      { aggregateType: "Vehicle", eventType: "VehicleCreated"},
      { aggregateType: "Vehicle", eventType: "VehicleGeneralInfoUpdated" },
      { aggregateType: "Vehicle", eventType: "VehicleStateUpdated" },
      { aggregateType: "Vehicle", eventType: "VehicleFeaturesUpdated"},
      { aggregateType: "Vehicle", eventType: "VehicleBlockRemoved" },
      { aggregateType: "Cronjob", eventType: "PicoPlacaCaliBlockJobTriggered" },
      { aggregateType: "Vehicle", eventType: "VehicleBlockAdded" },
      { aggregateType: "Vehicle", eventType: "VehicleSubscriptionPaid"},      
      { aggregateType: "Vehicle", eventType: "VehicleSubscriptionTrialApplied" },
      { aggregateType: "Vehicle", eventType: "VehicleSubscriptionTransferred" },
      { aggregateType: "Vehicle", eventType: "VehicleSubscriptionTypeUpdated" },
      // cronjob
      { aggregateType: "Cronjob", eventType: "PicoPlacaCaliUnblockJobTriggered"},
      { aggregateType: "Cronjob", eventType: "PeriodicFiveMinutes" },
      { aggregateType: "Cronjob", eventType: "PeriodicFifteenMinutes" },
      { aggregateType: "Cronjob", eventType: "ValidateInactiveVehicles" },
      // Service
      { aggregateType: "Service", eventType: "ServiceAssigned" },
    ]
  }
}

/**
 * @returns {EventStoreService}
 */
module.exports = () => {
  if (!instance) {
    instance = new EventStoreService();
    console.log("NEW  EventStore instance  !!");
  }
  return instance;
};

