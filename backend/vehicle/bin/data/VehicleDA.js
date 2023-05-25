"use strict";

let mongoDB = undefined;
//const mongoDB = require('./MongoDB')();
const COLLECTION_NAME = "Vehicle";
const { CustomError } = require("../tools/customError");
const { map, tap } = require("rxjs/operators");
const { of, Observable, defer } = require("rxjs");

const PAY_PER_SERVICE = "PAY_PER_SERVICE";

class VehicleDA {
  static start$(mongoDbInstance) {
    return Observable.create(observer => {
      if (mongoDbInstance) {
        mongoDB = mongoDbInstance;
        observer.next("using given mongo instance");
      } else {
        mongoDB = require("./MongoDB").singleton();
        observer.next("using singleton system-wide mongo instance");
      }
      observer.complete();
    });
  }

  /**
   * Gets an user by its username
   */
  static getVehicle$(id, businessId) {
    const collection = mongoDB.db.collection(COLLECTION_NAME);
    const query  = {  _id: id  } ;

    if(businessId){
      query.businessId = businessId;
    }

    return defer(() => collection.findOne(query));
  }

  static getVehicleList$(filter, pagination) {
    const collection = mongoDB.db.collection(COLLECTION_NAME);

    const query = {};

    if(filter.subscriptionExpired == 'true'){
      query["subscription.status"] = "INACTIVE";
    }

    if(filter.subscriptionExpired == 'false'){
      query["subscription.status"] = "ACTIVE";
    }

    if(filter.onTrial === 'true'){
      query["subscription.onTrial"] = {$gte: Date.now()};
    }


    if(filter.showBlocked){ query.blocks = { $exists: true, $ne: [] } }

    if(filter.showInactive){ query.state = false }

    if (filter.businessId) {
      query.businessId = filter.businessId;
    }

    if (filter.licensePlate) {
      query["generalInfo.licensePlate"] = filter.licensePlate.toUpperCase();
    }

    if (filter.creationTimestamp) {
      query.creationTimestamp = { $gte: filter.creationTimestamp };
    }

    if (filter.creatorUser) {
      query.creatorUser = { $regex: filter.creatorUser, $options: "i" };
    }

    if (filter.modifierUser) {
      query.modifierUser = { $regex: filter.modifierUser, $options: "i" };
    }

    const cursor = collection
      .find(query)
      .skip(pagination.count * pagination.page)
      .limit(pagination.count);

    return mongoDB.extractAllFromMongoCursor$(cursor);
  }

  static getVehicleSize$(filter) {
    const collection = mongoDB.db.collection(COLLECTION_NAME);

    const query = {};

    if(filter.subscriptionExpired == 'true'){
      query["subscription.status"] = "INACTIVE";
    }

    if(filter.subscriptionExpired == 'false'){
      query["subscription.status"] = "ACTIVE";
    }

    if(filter.showBlocked){ query.blocks = { $exists: true, $ne: [] } }
    if(filter.showInactive){ query.state = false }

    if (filter.businessId) {
      query.businessId = filter.businessId;
    }

    // if (filter.name) {
    //   query["generalInfo.name"] = { $regex: filter.name, $options: "i" };
    // }

    if (filter.licensePlate) {
      query["generalInfo.licensePlate"] = { $regex: filter.licensePlate, $options: "i" };
    }

    if (filter.creationTimestamp) {
      query.creationTimestamp = { $gte: filter.creationTimestamp };
    }

    if (filter.creatorUser) {
      query.creatorUser = { $regex: filter.creatorUser, $options: "i" };
    }

    if (filter.modifierUser) {
      query.modifierUser = { $regex: filter.modifierUser, $options: "i" };
    }

    return collection.count(query);
  }

  /**
   * Creates a new Vehicle
   * @param {*} vehicle vehicle to create
   */
  static createVehicle$(vehicle) {
    const collection = mongoDB.db.collection(COLLECTION_NAME);
    return defer(() => collection.insertOne(vehicle));
  }

      /**
   * modifies the general info of the indicated Vehicle 
   * @param {*} id  Vehicle ID
   * @param {*} VehicleGeneralInfo  New general information of the Vehicle
   */
  static updateVehicleGeneralInfo$(id, VehicleGeneralInfo) {
    const collection = mongoDB.db.collection(COLLECTION_NAME);

    return defer(()=>
        collection.findOneAndUpdate(
          { _id: id },
          {
            $set: {generalInfo: VehicleGeneralInfo.generalInfo, modifierUser: VehicleGeneralInfo.modifierUser, modificationTimestamp: VehicleGeneralInfo.modificationTimestamp}
          },{
            returnOriginal: false
          }
        )
    ).pipe(
      map(result => result && result.value ? result.value : undefined)
    );
  }

  /**
   * Updates the Vehicle state 
   * @param {string} id Vehicle ID
   * @param {boolean} newVehicleState boolean that indicates the new Vehicle state
   */
  static updateVehicleState$(id, newVehicleState) {
    const collection = mongoDB.db.collection(COLLECTION_NAME);
    
    return defer(()=>
        collection.findOneAndUpdate(
          { _id: id},
          {
            $set: {state: newVehicleState.state, modifierUser: newVehicleState.modifierUser, modificationTimestamp: newVehicleState.modificationTimestamp}
          },{
            returnOriginal: false
          }
        )
    ).pipe(
      map(result => result && result.value ? result.value : undefined)
    );
  }

  static updateVehicleFeatures$(id, newData) {
    const collection = mongoDB.db.collection(COLLECTION_NAME);
    return defer(() => collection.findOneAndUpdate(
      { _id: id },
      {
        $set: {
          features: newData.features,
          modifierUser: newData.modifierUser,
          modificationTimestamp: newData.modificationTimestamp
        }
      },
      {
        returnOriginal: false
      }
    )
    ).pipe(
      map(result => result && result.value ? result.value : undefined)
    );

  }

  /**
   * Find a vehicle by license plate
   * @param {string} licensePlate license plate
   */
  static findVehicleByLicensePlate$(licensePlate){
    const collection = mongoDB.db.collection(COLLECTION_NAME);
    return defer(() => collection.findOne({'generalInfo.licensePlate': licensePlate }));
  }


  /**
   * Find vehicles that match with params
   * @param {Array} buIds String array
   * @param {Array} licensePlateEnding Array with number as string to use in regular expresion
   */
  static getVehicleListToAplyPYP_Blocks$(buIds, licensePlateEnding, originField) {
    const collection = mongoDB.db.collection(COLLECTION_NAME);
    const query = { state: true, businessId: { $in: buIds } };
    if (originField === "COMPLEMENTARY") {
      query["generalInfo.complementary"] = { $regex: `.*(${licensePlateEnding.join("|")})$` };
    } else { 
      { 
        query["generalInfo.licensePlate"] = { $regex: `.*(${licensePlateEnding.join("|")})$` };
      }
  
    }

    const cursor = collection.find(query, { projection: { "generalInfo.licensePlate": 1, businessId: 1 } });
    return mongoDB.extractAllFromMongoCursor$(cursor);
  }

  static inserBlock$({vehicleId, businessId, licensePlate, blockKey, notes = '', endTime = undefined, user}){
    const collection = mongoDB.db.collection(COLLECTION_NAME);
    const updateInfo = {
      $addToSet: { blocks: blockKey }
    } 
    if(blockKey === "SUBSCRIPTION_EXPIRED"){
      updateInfo.$set = {"subscription.status": "INACTIVE"};
    }
    return defer(() => collection.updateOne(
      { _id: vehicleId },
      updateInfo
    ))
  }

  static findVehiclesToSetInactive$(businessId, timestamp){
    const collection = mongoDB.db.collection(COLLECTION_NAME);
    const query = { 
      state: true,  
      businessId,
      lastServiceTimestamp: { $lte: timestamp }, 
      "subscription.expirationTime": { $lte: timestamp },
    };
    const projection = { _id: 1, businessId: 1, "generalInfo.licensePlate": 1 };
    const cursor = collection.find(query, { projection });
    console.log(`QUERY: ${JSON.stringify(query)}`)
    return mongoDB.extractAllFromMongoCursor$(cursor);
  }

  static updateLastServiceTimestamp$(vehicleId, timestamp){
    const collection = mongoDB.db.collection(COLLECTION_NAME);
    const query = { _id: vehicleId };
    const update = { $set: { lastServiceTimestamp: timestamp } };
    // console.log(`QUERY: ${JSON.stringify(query)} -- UPDATE: ${JSON.stringify(update)}`)
    return defer(() => collection.updateOne( query, update ));
  }

  static removeBlock$({vehicleId, blockKey}){
    const collection = mongoDB.db.collection(COLLECTION_NAME);
    return defer(() => collection.updateOne(
      { _id: vehicleId },
      {
        $pull: { blocks: blockKey }
      } 
    ))
  }

  static updateVehicleMembership$(licensePlate, subscription){
    const collection = mongoDB.db.collection(COLLECTION_NAME);
    return defer( () => collection.updateOne(
      {'generalInfo.licensePlate': licensePlate},
      { 
        $set: { subscription: subscription }, 
      }
      ))
  }

  static incrementVehicleMembership$(licensePlate, subscription){
    const collection = mongoDB.db.collection(COLLECTION_NAME);
    return defer( () => collection.updateOne(
      {'generalInfo.licensePlate': licensePlate},
      { 
        $set: { "subscription.status": subscription.status },
        $inc: { "subscription.expirationTime": subscription.expirationTime }
      }
      ))
  }

  static getExpiredSubscriptions$(timestamp){
    const collection = mongoDB.db.collection(COLLECTION_NAME);
    const query = {
      $and: [
        { "subscription.status": "ACTIVE" },
        { "subscription.type": { "$ne": PAY_PER_SERVICE } },
        { "subscription.expirationTime": { $lte: timestamp } }
      ]
    };    
    return mongoDB.extractAllFromMongoCursor$(collection.find(query));
  }

  /**
   * 
   * @param {String} vehicleId 
   * @param {Object} update 
   */
  static updateVehicleSubscriptionTypeByVehicleId$(vehicleId, update){
    const collection = mongoDB.db.collection(COLLECTION_NAME);
    return defer(() => collection.findOneAndUpdate(
      { _id: vehicleId },
      { $set: {...update} },
      { returnOriginal: false }
    )).pipe(
      map(result => result && result.value ? result.value : undefined)
    );
  }

}
/**
 * @returns {VehicleDA}
 */
module.exports = VehicleDA;
