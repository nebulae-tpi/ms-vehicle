"use strict";

const uuidv4 = require("uuid/v4");
const { of, interval } = require("rxjs");
const Event = require("@nebulae/event-store").Event;
const eventSourcing = require("../../tools/EventSourcing")();
const VehicleDA = require("../../data/VehicleDA");
const VehicleBlocksDA = require('../../data/VehicleBlocksDA')
const broker = require("../../tools/broker/BrokerFactory")();
const MATERIALIZED_VIEW_TOPIC = "materialized-view-updates";
const GraphqlResponseTools = require('../../tools/GraphqlResponseTools');
const RoleValidator = require("../../tools/RoleValidator");
const { take, mergeMap, catchError, map, toArray, tap } = require('rxjs/operators');
const {
  CustomError,
  DefaultError,
  INTERNAL_SERVER_ERROR_CODE,
  PERMISSION_DENIED
} = require("../../tools/customError");



/**
 * Singleton instance
 */
let instance;

class VehicleCQRS {
  constructor() {
  }

  /**  
   * Gets the Vehicle
   *
   * @param {*} args args
   */
  getVehicle$({ args }, authToken) {
    return RoleValidator.checkPermissions$(
      authToken.realm_access.roles,
      "Vehicle",
      "getVehicle",
      PERMISSION_DENIED,
      ["PLATFORM-ADMIN"]
    ).pipe(
      mergeMap(roles => {
        const isPlatformAdmin = roles["PLATFORM-ADMIN"];
        //If an user does not have the role to get the Vehicle from other business, the query must be filtered with the businessId of the user
        const businessId = !isPlatformAdmin? (authToken.businessId || ''): null;
        return VehicleDA.getVehicle$(args.id, businessId)
      }),
      mergeMap(rawResponse => GraphqlResponseTools.buildSuccessResponse$(rawResponse)),
      catchError(err => GraphqlResponseTools.handleError$(error))
    );
  }

  /**  
   * Gets the Vehicle list
   *
   * @param {*} args args
   */
  getVehicleList$({ args }, authToken) {
    return RoleValidator.checkPermissions$(
      authToken.realm_access.roles,
      "Vehicle",
      "getVehicleList",
      PERMISSION_DENIED,
      ["PLATFORM-ADMIN"]
    ).pipe(
      mergeMap(roles => {
        const isPlatformAdmin = roles["PLATFORM-ADMIN"];
        //If an user does not have the role to get the Vehicle from other business, the query must be filtered with the businessId of the user
        const businessId = !isPlatformAdmin? (authToken.businessId || ''): args.filterInput.businessId;
        const filterInput = args.filterInput;
        filterInput.businessId = businessId;

        return VehicleDA.getVehicleList$(filterInput, args.paginationInput);
      }),
      toArray(),
      mergeMap(rawResponse => GraphqlResponseTools.buildSuccessResponse$(rawResponse)),
      catchError(err => GraphqlResponseTools.handleError$(err))
    );
  }

    /**  
   * Gets the amount of the Vehicle according to the filter
   *
   * @param {*} args args
   */
  getVehicleListSize$({ args }, authToken) {
    return RoleValidator.checkPermissions$(
      authToken.realm_access.roles,
      "Vehicle",
      "getVehicleListSize",
      PERMISSION_DENIED,
      ["PLATFORM-ADMIN"]
    ).pipe(
      mergeMap(roles => {
        const isPlatformAdmin = roles["PLATFORM-ADMIN"];
        //If an user does not have the role to get the Vehicle from other business, the query must be filtered with the businessId of the user
        const businessId = !isPlatformAdmin? (authToken.businessId || ''): args.filterInput.businessId;
        const filterInput = args.filterInput;
        filterInput.businessId = businessId;

        return VehicleDA.getVehicleSize$(filterInput);
      }),
      mergeMap(rawResponse => GraphqlResponseTools.buildSuccessResponse$(rawResponse)),
      catchError(err => GraphqlResponseTools.handleError$(err))
    );
  }

    /**
  * Create a vehicle
  */
 createVehicle$({ root, args, jwt }, authToken) {
    const vehicle = args ? args.input: undefined;
    vehicle._id = uuidv4();
    vehicle.creatorUser = authToken.preferred_username;
    vehicle.creationTimestamp = new Date().getTime();
    vehicle.modifierUser = authToken.preferred_username;
    vehicle.modificationTimestamp = new Date().getTime();

    return RoleValidator.checkPermissions$(
      authToken.realm_access.roles,
      "Vehicle",
      "createVehicle$",
      PERMISSION_DENIED,
      ["PLATFORM-ADMIN"]
    ).pipe(
      mergeMap(() => eventSourcing.eventStore.emitEvent$(
        new Event({
          eventType: "VehicleCreated",
          eventTypeVersion: 1,
          aggregateType: "Vehicle",
          aggregateId: vehicle._id,
          data: vehicle,
          user: authToken.preferred_username
        }))
      ),
      map(() => ({ code: 200, message: `Vehicle with id: ${vehicle._id} has been created` })),
      mergeMap(r => GraphqlResponseTools.buildSuccessResponse$(r)),
      catchError(err => GraphqlResponseTools.handleError$(err))
    );
  }

    /**
   * Edit the vehicle state
   */
  updateVehicleGeneralInfo$({ root, args, jwt }, authToken) {
    const vehicle = {
      _id: args.id,
      generalInfo: args.input,
      modifierUser: authToken.preferred_username,
      modificationTimestamp: new Date().getTime()
    };

    return RoleValidator.checkPermissions$(
      authToken.realm_access.roles,
      "Vehicle",
      "updateVehicleGeneralInfo$",
      PERMISSION_DENIED,
      ["PLATFORM-ADMIN"]
    ).pipe(
      mergeMap(() => eventSourcing.eventStore.emitEvent$(
        new Event({
          eventType: "VehicleGeneralInfoUpdated",
          eventTypeVersion: 1,
          aggregateType: "Vehicle",
          aggregateId: vehicle._id,
          data: vehicle,
          user: authToken.preferred_username
        })
      )
      ),
      map(() => ({ code: 200, message: `Vehicle with id: ${vehicle._id} has been updated` })),
      mergeMap(r => GraphqlResponseTools.buildSuccessResponse$(r)),
      catchError(err => GraphqlResponseTools.handleError$(err))
    );
  }


  /**
   * Edit the vehicle state
   */
  updateVehicleState$({ root, args, jwt }, authToken) {
    const vehicle = {
      _id: args.id,
      state: args.newState,
      modifierUser: authToken.preferred_username,
      modificationTimestamp: new Date().getTime()
    };

    return RoleValidator.checkPermissions$(
      authToken.realm_access.roles,
      "Vehicle",
      "updateVehicleState$",
      PERMISSION_DENIED,
      ["PLATFORM-ADMIN"]
    ).pipe(
      mergeMap(() => eventSourcing.eventStore.emitEvent$(
        new Event({
          eventType: "VehicleStateUpdated",
          eventTypeVersion: 1,
          aggregateType: "Vehicle",
          aggregateId: vehicle._id,
          data: vehicle,
          user: authToken.preferred_username
        })
      )
      ),
      map(() => ({ code: 200, message: `Vehicle with id: ${vehicle._id} has been updated` })),
      mergeMap(r => GraphqlResponseTools.buildSuccessResponse$(r)),
      catchError(err => GraphqlResponseTools.handleError$(err))
    );
  }


  updateVehicleFeatures$({ root, args, jwt }, authToken) {    
    const vehicleUpdate = {
      _id: args.id,
      features: args.input,
      modifierUser: authToken.preferred_username,
      modificationTimestamp: new Date().getTime()
    };

    console.log(vehicleUpdate);

    return RoleValidator.checkPermissions$(
      authToken.realm_access.roles,
      "vehicleUpdate",
      "updateVehicleState$",
      PERMISSION_DENIED,
      ["PLATFORM-ADMIN"]
    ).pipe(
      mergeMap(() => eventSourcing.eventStore.emitEvent$(
        new Event({
          eventType: "VehicleFeaturesUpdated",
          eventTypeVersion: 1,
          aggregateType: "Vehicle",
          aggregateId: vehicleUpdate._id,
          data: vehicleUpdate,
          user: authToken.preferred_username
        })
      )
      ),
      map(() => ({ code: 200, message: `Vehicle with id: ${vehicleUpdate._id} has been updated` })),
      mergeMap(r => GraphqlResponseTools.buildSuccessResponse$(r)),
      catchError(err => GraphqlResponseTools.handleError$(err))
    );
  }

  getVehicleBlocks$({ root, args, jwt }, authToken) { 
    console.log(args);

    return RoleValidator.checkPermissions$(
      authToken.realm_access.roles,
      "vehicleBlocks",
      "getVehicleBlocks$",
      PERMISSION_DENIED,
      ["PLATFORM-ADMIN"]
    ).pipe(
      // map(() => [{
      //   key: 'PICO_Y_PLACA',
      //   notes: 'PYP Ambiental',
      //   startTime: 0,
      //   endTime: 123456789,
      //   user: 'juan.ospina'
      // }]),
      mergeMap(() => VehicleBlocksDA.findBlocksByVehicle$(args.id)),
      mergeMap(r => GraphqlResponseTools.buildSuccessResponse$(r)),
      catchError(err => GraphqlResponseTools.handleError$(err))
    );

  }

  removeVehicleBlock$({ root, args, jwt }, authToken) { 
    return RoleValidator.checkPermissions$(
      authToken.realm_access.roles,
      "vehicleBlocks",
      "getVehicleBlocks$",
      PERMISSION_DENIED,
      ["PLATFORM-ADMIN"]
    ).pipe(
      mergeMap(() => eventSourcing.eventStore.emitEvent$(
        new Event({
          eventType: "VehicleBlockRemoved",
          eventTypeVersion: 1,
          aggregateType: "Vehicle",
          aggregateId: args.id,
          data: { blockKey: args.blockKey},
          user: authToken.preferred_username
        })
      )),
      map(() => ({ code: 200, message: `Vehicle with id: ${vehicleUpdate._id} has been updated` })),
      mergeMap(r => GraphqlResponseTools.buildSuccessResponse$(r)),
      catchError(err => GraphqlResponseTools.handleError$(err))
    );

  }


  //#endregion


}

/**
 * @returns {VehicleCQRS}
 */
module.exports = () => {
  if (!instance) {
    instance = new VehicleCQRS();
    console.log(`${instance.constructor.name} Singleton created`);
  }
  return instance;
};
