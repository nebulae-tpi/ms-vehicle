"use strict";

let mongoDB = undefined;
//const mongoDB = require('./MongoDB')();
const CollectionName = "Vehicle";
const { CustomError } = require("../tools/customError");
const { map } = require("rxjs/operators");
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
    const collection = mongoDB.db.collection(CollectionName);

    const query = {
      _id: id      
    };
    if(businessId){
      query.businessId = businessId;
    }

    return defer(() => collection.findOne(query));
  }

  static getVehicleList$(filter, pagination) {
    const collection = mongoDB.db.collection(CollectionName);

    const query = {
    };

    if (filter.businessId) {
      query.businessId = filter.businessId;
    }

    if (filter.name) {
      query["generalInfo.name"] = { $regex: filter.name, $options: "i" };
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

    const cursor = collection
      .find(query)
      .skip(pagination.count * pagination.page)
      .limit(pagination.count)
      .sort({ creationTimestamp: pagination.sort });

    return mongoDB.extractAllFromMongoCursor$(cursor);
  }

  static getVehicleSize$(filter) {
    const collection = mongoDB.db.collection(CollectionName);

    const query = {
    };

    if (filter.businessId) {
      query.businessId = filter.businessId;
    }

    if (filter.name) {
      query["generalInfo.name"] = { $regex: filter.name, $options: "i" };
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
    const collection = mongoDB.db.collection(CollectionName);
    return defer(() => collection.insertOne(vehicle));
  }

      /**
   * modifies the general info of the indicated Vehicle 
   * @param {*} id  Vehicle ID
   * @param {*} VehicleGeneralInfo  New general information of the Vehicle
   */
  static updateVehicleGeneralInfo$(id, VehicleGeneralInfo) {
    const collection = mongoDB.db.collection(CollectionName);

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
    const collection = mongoDB.db.collection(CollectionName);
    
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
    console.log(id, newData);
    const collection = mongoDB.db.collection(CollectionName);
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

}
/**
 * @returns {VehicleDA}
 */
module.exports = VehicleDA;
