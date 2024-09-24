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
  LICENSE_PLATE_ALREADY_USED,
  VEHICLE_NO_FOUND,
  VEHICLE_ON_TRIAL,
  TRIAL_DENIED,
  SUBSCRIPTION_TYPE_MODE_NOT_ALLOWED,
  DRIVER_ID_NO_FOUND_IN_TOKEN
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

  applyFreeTrialSubscription$({ root, args, jwt }, authToken){
    return RoleValidator.checkPermissions$(
      authToken.realm_access.roles, "Vehicle",
      "createVehicle$", PERMISSION_DENIED,
      ["PLATFORM-ADMIN", "BUSINESS-OWNER"]
    ).pipe(
      mergeMap((roles) => VehicleDA.getVehicle$(args.id, !roles["PLATFORM-ADMIN"] ? (authToken.businessId || ''): null)),
      mergeMap(vehicle => {
        if(!vehicle){
          return throwError(new CustomError('Vehicle no found', 'ApplyFreeTrialSubscription', VEHICLE_NO_FOUND.code, VEHICLE_NO_FOUND.description));
        }
        if( vehicle.subscription && vehicle.creationTimestamp != vehicle.subscription.expirationTime ){
          return throwError(new CustomError('Subscription Trial Denied ', 'ApplyFreeTrialSubscription', TRIAL_DENIED.code, TRIAL_DENIED.description)); 
        }
        return of(vehicle);
      }),
      mergeMap( vehicleFound => eventSourcing.eventStore.emitEvent$(
        new Event({
          eventType: "VehicleSubscriptionTrialApplied",
          eventTypeVersion: 1,
          aggregateType: "Vehicle",
          aggregateId: vehicleFound._id,
          data: {
            trialDays: args.days
          },
          user: authToken.preferred_username
        }))
      ),
      map(() => ({ code: 200, message: `Vehicle trial subscription applied` })),
      mergeMap(r => GraphqlResponseTools.buildSuccessResponse$(r)),
      catchError(err => GraphqlResponseTools.handleError$(err))
    );
  }

  transferSubsctiptionTime$({ root, args, jwt }, authToken){
    return RoleValidator.checkPermissions$(
      authToken.realm_access.roles, "Vehicle",
      "createVehicle$", PERMISSION_DENIED,
      ["PLATFORM-ADMIN", "BUSINESS-OWNER"]
    ).pipe(
      mergeMap((roles) => VehicleDA.getVehicle$(args.id)),
      mergeMap(vehicleOrigin => {
        if(vehicleOrigin == null){
          return throwError(new CustomError('Vehicle origin not found', 'ApplyFreeTrialSubscription', VEHICLE_NO_FOUND.code, VEHICLE_NO_FOUND.description));
        }
        else if(vehicleOrigin.subscription.expirationTime == vehicleOrigin.subscription.onTrial){
          return throwError(new CustomError('Vehicle origin on trial', 'ApplyFreeTrialSubscription', VEHICLE_ON_TRIAL.code, VEHICLE_ON_TRIAL.description));
        }
        return VehicleDA.getVehicleByLicensePlate$(args.licensePlateToTransfer, args.businessId).pipe(
          mergeMap(vehicleDestination => {
            if(vehicleDestination == null){
              return throwError(new CustomError('Vehicle destination not found', 'ApplyFreeTrialSubscription', VEHICLE_NO_FOUND.code, VEHICLE_NO_FOUND.description));
            }
            return of([vehicleOrigin, vehicleDestination]);
          })
        )
      }),
      mergeMap( ([vehicleOrigin,vehicleDestination ]) => eventSourcing.eventStore.emitEvent$(
        new Event({
          eventType: "VehicleSubscriptionTransferred",
          eventTypeVersion: 1,
          aggregateType: "Vehicle",
          aggregateId: vehicleDestination._id,
          data: {
            newSubscriptionTime: vehicleOrigin.subscription.expirationTime,
            vehicleOriginId: vehicleOrigin._id
          },
          user: authToken.preferred_username
        }))
      ),
      map(() => ({ code: 200, message: `Vehicle trial subscription applied` })),
      mergeMap(r => GraphqlResponseTools.buildSuccessResponse$(r)),
      catchError(err => GraphqlResponseTools.handleError$(err))
    );
  }

  /**
  * Create a vehicle
  */
 createVehicle$({ root, args, jwt }, authToken) {
    const vehicle = args ? args.input: undefined;
    const nowTime = vehicle.businessId === "2af56175-227e-40e7-97ab-84e8fa9e12ce" ? 4125241294000 : Date.now();
    vehicle._id = uuidv4();
    vehicle.creatorUser = authToken.preferred_username;
    vehicle.creationTimestamp = nowTime;
    vehicle.modifierUser = authToken.preferred_username;
    vehicle.modificationTimestamp = nowTime;
    vehicle.subscription = { status : "ACTIVE", type: "REGULAR", expirationTime : nowTime };

    return RoleValidator.checkPermissions$(
      authToken.realm_access.roles,
      "Vehicle",
      "createVehicle$",
      PERMISSION_DENIED,
      ["PLATFORM-ADMIN", "BUSINESS-OWNER", "COORDINATOR", "OPERATION-SUPERVISOR"]
    ).pipe(
      mergeMap(() => VehicleDA.findVehicleByLicensePlate$(vehicle.generalInfo.licensePlate )),
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

  // DRIVER API GATE-WAY

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
          return throwError(this.createCustomError$( DRIVER_ID_NO_FOUND_IN_TOKEN, 'vehicleMembershipExpiration'));
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

  vehicleMemberShipSwitchMode$({ root, args, jwt }, authToken) {
    const { licensePlate, mode } = args;
    const newSubscriptionMode = mode || "PAY_PER_SERVICE";
    return RoleValidator.checkPermissions$( authToken.realm_access.roles, "vehicleBlocks", "vehicleMemberShipSwitchMode$", PERMISSION_DENIED, ["DRIVER"]).pipe(
      mergeMap(roles => {
        if (!authToken.driverId) {
          console.log("Driver without driverID ", { args });
          return throwError(this.createCustomError( DRIVER_ID_NO_FOUND_IN_TOKEN, 'vehicleMemberShipSwitchMode'));
        }
        if( newSubscriptionMode !== "PAY_PER_SERVICE" && newSubscriptionMode !== "REGULAR"){          
          return throwError( this.createCustomError(SUBSCRIPTION_TYPE_MODE_NOT_ALLOWED, "vehicleMemberShipSwitchMode") );
        }
        return of(roles);
      }),
      mergeMap(() => VehicleDA.findVehicleByLicensePlate$(licensePlate)),
      // if vehicle subscription type is different to argument in query it send the ES event, else nothing happen
      mergeMap(vehicle => ( vehicle && vehicle.subscription.type !== newSubscriptionMode )
        ? eventSourcing.eventStore.emitEvent$(
            new Event({
              eventType: "VehicleSubscriptionTypeUpdated",
              eventTypeVersion: 1,
              aggregateType: "Vehicle",
              aggregateId: vehicle._id,
              data: { type: newSubscriptionMode },
              user: authToken.preferred_username
            })
        )
        : of(null)
      ),
      map(() => ({ accepted: true })),
      mergeMap(r => GraphqlResponseTools.buildSuccessResponse$(r)),
      catchError(err => GraphqlResponseTools.handleError$(err))
    );
  }

  createCustomError(customError, method){
    return new CustomError(undefined, method, customError.code, customError.description );
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
