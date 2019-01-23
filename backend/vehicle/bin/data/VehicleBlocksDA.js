"use strict";

let mongoDB = undefined;
const CollectionName = "vehicleBlocks";
const { CustomError } = require("../tools/customError");
const { map } = require("rxjs/operators");
const { of, Observable, defer } = require("rxjs");

class VehicleBlocksDA {
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


  static findBlocksByVehicle$(vehicleId) {
    console.log("findBlocksByVehicle$", vehicleId);
    const collection = mongoDB.db.collection(CollectionName);
    const query = {
      vehicleId: vehicleId
    };
    return defer(() => collection
      .find(query)
      .toArray()
    )
  }

  static removeBlockFromDevice$({vehicleId, blockKey}){
    const collection = mongoDB.db.collection(CollectionName);
    return defer(() => collection.deleteMany({vehicleId: vehicleId, key: blockKey}))
  }

  static removeExpiredBlocks$(timestamp){
    const collection = mongoDB.db.collection(CollectionName);
    return defer(() => collection.deleteMany( { endTime: { $$lte: timestamp } }))
  }

}
/**
 * @returns {VehicleDA}
 */
module.exports = VehicleBlocksDA;
