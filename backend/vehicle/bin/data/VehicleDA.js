"use strict";

let mongoDB = undefined;
//const mongoDB = require('./MongoDB')();
const COLLECTION_NAME = "Vehicle";
const { CustomError } = require("../tools/customError");
const { map, tap } = require("rxjs/operators");
const { of, Observable, defer } = require("rxjs");

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

    if(filter.showBlocked){ query.blocks = { $exists: true, $ne: [] } }

    if(filter.showInactive){ query.state = false }

    if (filter.businessId) {
      query.businessId = filter.businessId;
    }

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

    const cursor = collection
      .find(query)
      .skip(pagination.count * pagination.page)
      .limit(pagination.count)
      .sort({ creationTimestamp: pagination.sort });

    return mongoDB.extractAllFromMongoCursor$(cursor);
  }

  static getVehicleSize$(filter) {
    const collection = mongoDB.db.collection(COLLECTION_NAME);

    const query = {};

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
      query.creationTimestamp = filter.creationTimestamp;
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
  static getVehicleListToAplyPYP_Blocks$(buIds, licensePlateEnding) {
    const collection = mongoDB.db.collection(COLLECTION_NAME);
    const query = {};
    query["$and"] = [
      { businessId: { $in: buIds } },
      { "generalInfo.licensePlate": { $regex: `.*(${licensePlateEnding.join("|")})$` } },
    ];

    const cursor = collection.find(query, { projection: { "generalInfo.licensePlate": 1, businessId: 1 } });
    return mongoDB.extractAllFromMongoCursor$(cursor);
  }

  static inserBlock$({vehicleId, businessId, licensePlate, blockKey, notes = '', endTime = undefined, user}){
    const collection = mongoDB.db.collection(COLLECTION_NAME);
    return defer(() => collection.updateOne(
      { _id: vehicleId },
      {
        $addToSet: { blocks: blockKey }
      } 
    ))
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

}
/**
 * @returns {VehicleDA}
 */
module.exports = VehicleDA;
