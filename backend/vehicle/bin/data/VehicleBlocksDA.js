"use strict";

let mongoDB = undefined;
const COLLECTION_NAME = "vehicleBlocks";
const { CustomError } = require("../tools/customError");
const { map, catchError } = require("rxjs/operators");
const { of, Observable, defer, throwError } = require("rxjs");

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
    const collection = mongoDB.db.collection(COLLECTION_NAME);
    const query = {
      vehicleId: vehicleId
    };
    return defer(() => collection
      .find(query)
      .toArray()
    )
  }

  static removeBlockFromDevice$({vehicleId, blockKey}){
    const collection = mongoDB.db.collection(COLLECTION_NAME);
    return defer(() => collection.deleteMany({vehicleId: vehicleId, key: blockKey}))
  }

  static removeExpiredBlocks$(timestamp){
    const collection = mongoDB.db.collection(COLLECTION_NAME);
    return defer(() => collection.deleteMany( { endTime: { $$lte: timestamp } }))
  }

  static insertVehicleBlock$({vehicleId, licensePlate, blockKey, notes = '', endTime = undefined, user} ){
    const collection = mongoDB.db.collection(COLLECTION_NAME);

    return defer(() =>
      collection.insertOne({
        vehicleId: vehicleId,
        licensePlate: licensePlate,
        key: blockKey,
        notes: notes,
        startTime: Date.now(),
        endTime: endTime,
        user: user
      })
    )
    .pipe(
      catchError(err => {
        if(err.code == 11000){
          console.log(err.message);
          return of(null);
        }
        return throwError(err);
        
      })
    )

  }

}
/**
 * @returns {VehicleDA}
 */
module.exports = VehicleBlocksDA;
