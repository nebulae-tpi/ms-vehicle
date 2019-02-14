"use strict";
const {
    CustomError,
    LICENSE_PLATE_ALREADY_USED
  } = require("../../tools/customError");
const { map, tap, mergeMap } = require("rxjs/operators");
const { of, Observable, defer, throwError } = require("rxjs");
const VehicleDA = require("../../data/VehicleDA");

class VehicleHelper {

    static verifyLicencePlateUpdate$(Id, licencePlate) {
        return VehicleDA.findVehicleByLicensePlate$(licencePlate)
            .pipe(
                mergeMap(vehicleFound => (vehicleFound && vehicleFound._id != Id)
                    ? throwError(new CustomError('License Plate already used', 'createVehicle',
                        LICENSE_PLATE_ALREADY_USED.code, LICENSE_PLATE_ALREADY_USED.description))
                    : of(null)
                )
            )
    }
}
/**
 * @returns {VehicleHelper}
 */
module.exports = VehicleHelper;
