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
const moment = require('moment-timezone');

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
            mergeMap(result => broker.send$(MATERIALIZED_VIEW_TOPIC, `VehicleVehicleUpdatedSubscription`, result.ops[0])),
            catchError(err => console.log("ERROR ==> ", err))
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


    handlePicoPlacaCaliBlockJobTriggered$({ data }){        
        return of(data).pipe(
            mergeMap(({ licensePlateMap }) => of(Crossccutting.getDayOfYear()).pipe(
                // tap(dyo => console.log("DIA DEL AÑO ==> ", dyo)),
                map(dayOfYear => dayOfYear % Object.keys(data.licensePlateMap).length),
                // tap(dyo => console.log("DIA DEL AÑO MODULADO ==> ", dyo)),
                map(dayKey => licensePlateMap[dayKey].split(",").map(e => e.trim())),
                // tap(dyo => console.log("PLACAS A BLOQUEAR ==> ", dyo)),
            )),
            mergeMap(platesKey =>  VehicleDA.getVehicleListToAplyPYP_Blocks$( data.buIds, platesKey, data.originField) ),
            concatMap(e => of(e).pipe(delay(200))),
            tap(v => console.log(`${moment().format("YYYY/MM/DD HH:mm:ss")} ADDING PICO_Y_PLACA LOCK => AID: ${v._id}  PLATE: ${v.licensePlate} `)),
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
        return of({ vehicleId: aid, user: user, ...data })
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
                concatMap(e => of(e).pipe(delay(200))),
                tap(v => console.log(`${moment().format("YYYY/MM/DD HH:mm:ss")} REMOVING PICO_Y_PLACA LOCK => AID: ${v.vehicleId}  PLATE: ${v.licensePlate} `)),
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
                toArray()
            )
    }

    handleVehicleSubscriptionPaid$({aid, data, user, timestamp}){
        const millisInDay = 1000 * 60 * 60 * 24;
        return VehicleDA.findVehicleByLicensePlate$(data.licensePlate)
        .pipe(
            mergeMap(vehicle => forkJoin(
                // update vehicle subscription
                of(vehicle.subscription)
                    .pipe(
                        mergeMap(vehicleMembership => {
                            const newExpirationTime = !vehicleMembership || vehicleMembership.expirationTime < timestamp
                                    ? timestamp + (data.daysPaid * millisInDay)
                                    : vehicleMembership.expirationTime + (data.daysPaid * millisInDay);
                            console.log(`Sub Modificada (Pagada) => PLACA: ${data.licensePlate}, subscription nueva: ${moment(newExpirationTime).tz("America/Bogota").format("YYYY/MM/DD HH:mm")}`);
                            return of({
                                status: 'ACTIVE',
                                expirationTime: newExpirationTime
                            });
                        }),
                        mergeMap(vehicleMembership => VehicleDA.updateVehicleMembership$(data.licensePlate, vehicleMembership).pipe(
                            tap(r => console.log(`Se actualiza el tiempo de subscripcion => PLACA: ${data.licensePlate}, ID: ${r.value._id}, subscription: ${(r.value.subscription || {}).expirationTime}`))
                        ))
                    ),
                // send event to remove block by expired subscription
                eventSourcing.eventStore.emitEvent$(
                    new Event({
                      eventType: "VehicleBlockRemoved",
                      eventTypeVersion: 1,
                      aggregateType: "Vehicle",
                      aggregateId: vehicle._id,
                      data: { blockKey: "SUBSCRIPTION_EXPIRED" },
                      user: user
                    })
                  ),
                  // if current subscriptiontype == PAY_PER_SERVICE ==> send event to change it
                  of(vehicle.subscription).pipe(
                      mergeMap(( vehicleMembership ) =>  (!vehicleMembership || vehicleMembership.type !== "REGULAR")
                        ? eventSourcing.eventStore.emitEvent$(
                            new Event({
                              eventType: "VehicleSubscriptionTypeUpdated",
                              eventTypeVersion: 1,
                              aggregateType: "Vehicle",
                              aggregateId: vehicle._id,
                              data: { type: "REGULAR" },
                              user: user
                            })
                          )
                        : of(null)
                      )
                  )
            )),            
        );
    }

    handleVehicleSubscriptionTrialApplied$({aid, data, user, timestamp}){
        const millisInDay = 1000 * 60 * 60 * 24;
        return VehicleDA.getVehicle$(aid)
        .pipe(
            mergeMap(vehicle => forkJoin(
                VehicleDA.updateVehicleMembership$(vehicle.generalInfo.licensePlate, {
                    status: 'ACTIVE',
                    onTrial: timestamp + (data.trialDays * millisInDay),
                    expirationTime: timestamp + (data.trialDays * millisInDay)
                }),
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

    handleVehicleSubscriptionTransferred$({aid, data, user, timestamp}){
        return VehicleDA.getVehicle$(aid)
        .pipe(
            mergeMap(vehicle => forkJoin(
                VehicleDA.updateVehicleMembership$(vehicle.generalInfo.licensePlate, {
                    status: 'ACTIVE',
                    expirationTime: data.newSubscriptionTime
                }).pipe(
                    mergeMap(vehicle => {
                        return broker.send$(MATERIALIZED_VIEW_TOPIC, `VehicleVehicleUpdatedSubscription`, vehicle.value)
                    })
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
                ),
                VehicleDA.updateVehicleTimeById$(data.vehicleOriginId, Date.now()).pipe(
                    mergeMap(vehicle => {
                        return broker.send$(MATERIALIZED_VIEW_TOPIC, `VehicleVehicleUpdatedSubscription`, vehicle.value)
                    })
                )
            )),            
        );
    }

    handleVehicleSubscriptionTypeUpdated$({aid, data, user, timestamp}){
        const { type } = data;
        const update= { "subscription.type": type };
        if (type === "PAY_PER_SERVICE"){
            update["subscription.status"]= "ACTIVE";
        }        
        return VehicleDA.updateVehicleSubscriptionTypeByVehicleId$(aid, update).pipe(
            mergeMap((afterUpdate) => {
                switch (type) {
                    case "REGULAR":
                        return of(afterUpdate.subscription).pipe(                            
                            mergeMap(vehicleSubscription => vehicleSubscription.expirationTime > Date.now()
                                ? of([null, null])
                                : forkJoin(
                                    this.generateEventStoreEvent$("VehicleBlockAdded", 1, "Vehicle", afterUpdate._id,
                                        {
                                        blockKey: 'SUBSCRIPTION_EXPIRED',
                                        startTime: Date.now(),
                                        notes: 'Blocked by system because returned to Regular subscription type'
                                        }, "SYSTEM"),
                                    VehicleDA.updateVehicleMembership$(
                                        afterUpdate.generalInfo.licensePlate,
                                        { ...vehicleSubscription, status: 'INACTIVE' } 
                                    ).pipe(
                                        tap(v => console.log(`[${new Date().toLocaleString()}] Se actualiza tipo de subscripcion => ID: ${v.value._id}, subscription: ${(v.value.subscription || {}).expirationTime}`))
                                    ),
                                    VehicleBlocksDA.findByVehicleIdAndKey$(aid, "SUBSCRIPTION_EXPIRED" )
                                )),

                            mergeMap(([event, a, blocks]) => (event && !blocks ) ? eventSourcing.eventStore.emitEvent$(event) : of({}) ),
                            
                        );
                    case "PAY_PER_SERVICE":                        
                        return eventSourcing.eventStore.emitEvent$(
                            new Event({
                                eventType: "VehicleBlockRemoved",
                                eventTypeVersion: 1,
                                aggregateType: "Vehicle",
                                aggregateId: aid,
                                data: { blockKey: "SUBSCRIPTION_EXPIRED" },
                                user: "SYSTEM"
                            })
                      )             
                    default:
                        break;
                }
            })
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
 * @returns {VehicleES}
 */
module.exports = () => {
    if (!instance) {
        instance = new VehicleES();
        console.log(`${instance.constructor.name} Singleton created`);
    }
    return instance;
};