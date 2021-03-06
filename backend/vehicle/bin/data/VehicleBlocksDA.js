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
    const collection = mongoDB.db.collection(COLLECTION_NAME);
    const query = {
      vehicleId: vehicleId
    };
    return defer(() => collection
      .find(query)
      .toArray()
    )
  }

  static removeBlock$({vehicleId, blockKey}){
    const collection = mongoDB.db.collection(COLLECTION_NAME);
    return defer(() => collection.deleteMany({vehicleId: vehicleId, key: blockKey}))
  }

  static findAllExpiredBlocks$(timestamp){
    const collection = mongoDB.db.collection(COLLECTION_NAME);
    const query = { endTime: { $lte: timestamp } };
    return mongoDB.extractAllFromMongoCursor$(collection.find(query));
  }

  static insertVehicleBlock$({vehicleId, businessId, licensePlate, blockKey, notes = '', endTime = undefined, user} ){
    const collection = mongoDB.db.collection(COLLECTION_NAME);

    const query = { vehicleId, key: blockKey };
    const update =  { 
      vehicleId, businessId, licensePlate, key: blockKey,
      notes, startTime: Date.now(), endTime, user
    };

    return defer(() => collection.findOneAndUpdate(
      query,
      { $set: { ...update } },
      { upsert: true })
    ).pipe(
      catchError(err => {
        if(err.code == 11000){
          console.log(err.message);
          return of(null);
        }
        return throwError(err);        
      })
    )

  }

  static getVehicleListToRemovePYP_Blocks$(buIds){
    const collection = mongoDB.db.collection(COLLECTION_NAME);
    const query = {};
    query["$and"] = [
      { businessId: { $in: buIds } },
      { key: "PICO_Y_PLACA" }
    ];
    const cursor = collection.find(query, { projection: { _id: 0, licensePlate: 1, vehicleId: 1  } });
    return mongoDB.extractAllFromMongoCursor$(cursor);
  }

  static findByPlateAndKey$(licensePlate, blockKey){
    const collection = mongoDB.db.collection(COLLECTION_NAME);
    return defer(() => collection.findOne({ licensePlate: licensePlate, key: blockKey }));
  }

  static findByVehicleIdAndKey$(vehicleId, blockKey){
    const collection = mongoDB.db.collection(COLLECTION_NAME);
    return defer(() => collection.findOne({ vehicleId, key: blockKey }));
  }

}
/**
 * @returns {VehicleDA}
 */
module.exports = VehicleBlocksDA;
