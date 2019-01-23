import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject, of } from 'rxjs';
import { startWith,  tap, mergeMap } from 'rxjs/operators';
import { GatewayService } from '../../../../api/gateway.service';
import {
  VehicleCreateVehicle,
  VehicleUpdateVehicleGeneralInfo,
  VehicleUpdateVehicleState,
  VehicleVehicle,
  VehicleVehicleUpdatedSubscription,
  VehicleUpdateVehicleFeatures,
  VehicleVehicleBlocks,
  removeVehicleBlocking
} from '../gql/vehicle.js';

@Injectable()
export class VehicleDetailService {

  lastOperation = null;

  vehicle = null;

  constructor(private gateway: GatewayService) {

  }

  /**
   * Registers an operation, this is useful to indicate that we are waiting for the response of the CREATE operation
   */
  createOperation$(vehicle: any) {
    return of('CREATE').pipe(
      tap(operation => {
        this.lastOperation = operation;
        this.vehicle = vehicle;
      })
    );
  }

  /**
   * Registers an operation, this is useful to indicate that we are waiting for the response of the UPDATE operation
   */
  updateOperation$(vehicle: any) {
    return of('UPDATE').pipe(
      tap(operation => {
        this.lastOperation = operation;
        this.vehicle = vehicle;
      })
    );
  }

  /**
   * Unregisters an operation, this is useful to indicate that we are not longer waiting for the response of the last operation
   */
  resetOperation$() {
    return of('').pipe(
      tap(() => {
        this.lastOperation = null;
        this.vehicle = null;
      })
    );
  }

  createVehicleVehicle$(vehicle: any) {
    return this.createOperation$(vehicle)
      .pipe(
        mergeMap(() => this.gateway.apollo
          .mutate<any>({
            mutation: VehicleCreateVehicle,
            variables: {
              input: vehicle
            },
            errorPolicy: 'all'
          }))
      );
  }

  updateVehicleVehicleGeneralInfo$(id: String, vehicleGeneralInfo: any) {
    return this.updateOperation$(vehicleGeneralInfo)
      .pipe(
        mergeMap(() => this.gateway.apollo
          .mutate<any>({
            mutation: VehicleUpdateVehicleGeneralInfo,
            variables: {
              id: id,
              input: vehicleGeneralInfo
            },
            errorPolicy: 'all'
          }))
      );
  }

  updateVehicleVehicleFeatures$(id: String, vehicleFeatures: any) {
    return this.updateOperation$(vehicleFeatures)
      .pipe(
        mergeMap(() => this.gateway.apollo
          .mutate<any>({
            mutation: VehicleUpdateVehicleFeatures,
            variables: {
              id: id,
              input: vehicleFeatures
            },
            errorPolicy: 'all'
          }))
      );
  }

  updateVehicleVehicleState$(id: String, newState: boolean) {
    return this.gateway.apollo
      .mutate<any>({
        mutation: VehicleUpdateVehicleState,
        variables: {
          id: id,
          newState: newState
        },
        errorPolicy: 'all'
      });
  }

  removeVehicleBlock$(id: String, blockKey: string) {
    return this.gateway.apollo
      .mutate<any>({
        mutation: removeVehicleBlocking,
        variables: {
          id: id,
          blockKey: blockKey
        },
        errorPolicy: 'all'
      });
  }


  getVehicleVehicle$(entityId: string) {
    return this.gateway.apollo.query<any>({
      query: VehicleVehicle,
      variables: {
        id: entityId
      },
      fetchPolicy: 'network-only',
      errorPolicy: 'all'
    });
  }


  getVehicleVehicleBlocks$(entityId: string) {
    return this.gateway.apollo.query<any>({
      query: VehicleVehicleBlocks,
      variables: {
        id: entityId
      },
      fetchPolicy: 'network-only',
      errorPolicy: 'all'
    });
  }


/**
 * Event triggered when a business is created, updated or deleted.
 */
  subscribeVehicleVehicleUpdatedSubscription$(): Observable<any> {
    return this.gateway.apollo
      .subscribe({
        query: VehicleVehicleUpdatedSubscription
      });
  }

}
