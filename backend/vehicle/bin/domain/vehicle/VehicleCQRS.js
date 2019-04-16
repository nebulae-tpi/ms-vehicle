"use strict";

const uuidv4 = require("uuid/v4");
const { of, interval, throwError, forkJoin } = require("rxjs");
const Event = require("@nebulae/event-store").Event;
const eventSourcing = require("../../tools/EventSourcing")();
const VehicleDA = require("../../data/VehicleDA");
const VehicleBlocksDA = require('../../data/VehicleBlocksDA')
const broker = require("../../tools/broker/BrokerFactory")();
const MATERIALIZED_VIEW_TOPIC = "materialized-view-updates";
const GraphqlResponseTools = require('../../tools/GraphqlResponseTools');
const RoleValidator = require("../../tools/RoleValidator");
const { take, mergeMap, catchError, map, toArray, tap, delay } = require('rxjs/operators');
const VehicleHelper = require("./VehicleHelper");
const {
  CustomError,
  DefaultError,
  INTERNAL_SERVER_ERROR_CODE,
  PERMISSION_DENIED,
  LICENSE_PLATE_ALREADY_USED
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
      ["PLATFORM-ADMIN", "BUSINESS-OWNER", "COORDINATOR", "OPERATION-SUPERVISOR"]
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
      ["PLATFORM-ADMIN", "BUSINESS-OWNER", "COORDINATOR", "OPERATION-SUPERVISOR"]
    ).pipe(
      mergeMap(roles => {
        const isPlatformAdmin = roles["PLATFORM-ADMIN"];
        //If an user does not have the role to get the Vehicle from other business, the query must be filtered with the businessId of the user
        const businessId = !isPlatformAdmin? (authToken.businessId || ''): args.filterInput.businessId;
        const filterInput = args.filterInput;
        filterInput.businessId = businessId;

        return VehicleDA.getVehicleList$(filterInput, args.paginationInput);
      }),
      map(vehicle => ({ ...vehicle, blockings: vehicle.blocks })),
      toArray(),
      map(vehiclesList => vehiclesList.sort((a,b) => b.creationTimestamp - a.creationTimestamp )),
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
      ["PLATFORM-ADMIN", "BUSINESS-OWNER", "COORDINATOR", "OPERATION-SUPERVISOR"]
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
      ["PLATFORM-ADMIN", "BUSINESS-OWNER", "COORDINATOR", "OPERATION-SUPERVISOR"]
    ).pipe(
      mergeMap(()=> VehicleDA.findVehicleByLicensePlate$(vehicle.generalInfo.licensePlate)),
      mergeMap( vehicleFound => vehicleFound == null 
        ? eventSourcing.eventStore.emitEvent$(
          new Event({
            eventType: "VehicleCreated",
            eventTypeVersion: 1,
            aggregateType: "Vehicle",
            aggregateId: vehicle._id,
            data: vehicle,
            user: authToken.preferred_username
          }))
        : throwError(new CustomError('License Plate already used', 'createVehicle',
          LICENSE_PLATE_ALREADY_USED.code, LICENSE_PLATE_ALREADY_USED.description)
        )
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
      ["PLATFORM-ADMIN", "BUSINESS-OWNER", "COORDINATOR", "OPERATION-SUPERVISOR"]
    ).pipe(
      mergeMap(() => VehicleHelper.verifyLicencePlateUpdate$(vehicle._id, vehicle.generalInfo.licensePlate)),
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
      ["PLATFORM-ADMIN", "BUSINESS-OWNER", "COORDINATOR", "OPERATION-SUPERVISOR"]
    ).pipe(
      mergeMap(() => eventSourcing.eventStore.emitEvent$(
        new Event({
          eventType: "VehicleStateUpdated",
          eventTypeVersion: 1,
          aggregateType: "Vehicle",
          aggregateId: vehicle._id,
          data: vehicle,
          user: authToken.preferred_username
        }))
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


    return RoleValidator.checkPermissions$(
      authToken.realm_access.roles,
      "vehicleUpdate",
      "updateVehicleState$",
      PERMISSION_DENIED,
      ["PLATFORM-ADMIN", "BUSINESS-OWNER", "COORDINATOR", "OPERATION-SUPERVISOR"]
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
    return RoleValidator.checkPermissions$(
      authToken.realm_access.roles,
      "vehicleBlocks",
      "getVehicleBlocks$",
      PERMISSION_DENIED,
      ["PLATFORM-ADMIN", "BUSINESS-OWNER", "COORDINATOR", "OPERATION-SUPERVISOR"]
    ).pipe(
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
      ["PLATFORM-ADMIN", "BUSINESS-OWNER", "COORDINATOR", "OPERATION-SUPERVISOR", "DISCIPLINARY-COMMITTEE"]
    ).pipe(
      // mergeMap(() => (args.blockKey == "SUBSCRIPTION_EXPIRED")
      //   ? throwError(new CustomError('License Plate already used', 'createVehicle',
      //   LICENSE_PLATE_ALREADY_USED.code, LICENSE_PLATE_ALREADY_USED.description))
      //   : of({}) 
      // ),
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
      map(() => ({ code: 200, message: `Vehicle with id: ${args.id} has been updated` })),
      mergeMap(r => GraphqlResponseTools.buildSuccessResponse$(r)),
      catchError(err => GraphqlResponseTools.handleError$(err))
    );

  }

  addVehicleBlock$({ root, args, jwt }, authToken) {
    return RoleValidator.checkPermissions$(
      authToken.realm_access.roles,
      "vehicleBlocks",
      "getVehicleBlocks$",
      PERMISSION_DENIED,
      ["PLATFORM-ADMIN", "BUSINESS-OWNER", "COORDINATOR", "OPERATION-SUPERVISOR", "DISCIPLINARY-COMMITTEE"]
    ).pipe(
      mergeMap(() => eventSourcing.eventStore.emitEvent$(
        new Event({
          eventType: "VehicleBlockAdded",
          eventTypeVersion: 1,
          aggregateType: "Vehicle",
          aggregateId: args.id,
          data: {
            blockKey: args.input.key,
            startTime: args.input.startTime,
            endTime: args.input.endTime,
            notes: args.input.notes
          },
          user: authToken.preferred_username
        })
      )),
      map(() => ({ code: 200, message: `Vehicle with id: ${args.id} has been updated` })),
      mergeMap(r => GraphqlResponseTools.buildSuccessResponse$(r)),
      catchError(err => GraphqlResponseTools.handleError$(err))
    );

  }

  vehicleMembershipExpiration$({ root, args, jwt }, authToken) {
    // console.log("vehicleMembershipExpiration$ ==> ", args);
    return RoleValidator.checkPermissions$(
      authToken.realm_access.roles,
      "vehicleBlocks",
      "getVehicleBlocks$",
      PERMISSION_DENIED,
      ["DRIVER"]
    ).pipe(
      mergeMap(roles => {
        if (!authToken.driverId) {
          console.log("Driver without driverID ", {args});
          return this.createCustomError$(
            DRIVER_ID_NO_FOUND_IN_TOKEN,
            'vehicleMembershipExpiration'
          );
        }
        return of(roles);
      }),
      mergeMap(() => VehicleDA.findVehicleByLicensePlate$(args.licensePlate)),
      // tap(vf => console.log("VEHICLE FOUND  ==> ", vf)),
      map(v => (v && v.subscription && v.subscription.expirationTime) ? v.subscription.expirationTime : null),
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
