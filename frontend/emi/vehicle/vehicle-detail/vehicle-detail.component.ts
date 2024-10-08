////////// ANGULAR //////////
import {
  Component,
  OnInit,
  OnDestroy
} from '@angular/core';

import {
  FormBuilder,
  FormGroup,
  FormControl,
  Validators
} from '@angular/forms';

import { Router, ActivatedRoute } from '@angular/router';

////////// RXJS ///////////
import { map, mergeMap, tap, takeUntil, take } from 'rxjs/operators';
import { Subject, of} from 'rxjs';

//////////// ANGULAR MATERIAL ///////////
import {
  MatPaginator,
  MatSort,
  MatTableDataSource,
  MatSnackBar
} from '@angular/material';

//////////// i18n ////////////
import {
  TranslateService
} from '@ngx-translate/core';
import { locale as english } from '../i18n/en';
import { locale as spanish } from '../i18n/es';
import { FuseTranslationLoaderService } from '../../../../core/services/translation-loader.service';

//////////// Other Services ////////////
import { KeycloakService } from 'keycloak-angular';
import { VehicleDetailService } from './vehicle-detail.service';

@Component({
  // tslint:disable-next-line:component-selector
  selector: 'vehicle',
  templateUrl: './vehicle-detail.component.html',
  styleUrls: ['./vehicle-detail.component.scss']
})
// tslint:disable-next-line:class-name
export class VehicleDetailComponent implements OnInit, OnDestroy {
  // Subject to unsubscribe
  private ngUnsubscribe = new Subject();

  pageType: string;

  vehicle: any;

  constructor(
    private translationLoader: FuseTranslationLoaderService,
    private translate: TranslateService,
    private formBuilder: FormBuilder,
    public snackBar: MatSnackBar,
    private router: Router,
    private activatedRouter: ActivatedRoute,
    private VehicleDetailservice: VehicleDetailService,
    private route: ActivatedRoute
  ) {
      this.translationLoader.loadTranslations(english, spanish);
  }


  ngOnInit() {
    this.loadvehicle();
    this.subscribeVehicleUpdated();
    this.stopWaitingOperation();
  }

  loadvehicle(){
    this.route.params
    .pipe(
      map(params => params['id']),
      mergeMap(entityId => entityId !== 'new'
        ? this.VehicleDetailservice.getVehicleVehicle$(entityId)
            .pipe(map(res => res.data.VehicleVehicle))
        : of(null)
      ),
      takeUntil(this.ngUnsubscribe)
    )
    .subscribe((vehicle: any) => {
      this.vehicle = vehicle;
      this.pageType = (vehicle && vehicle._id) ? 'edit' : 'new';
    }, e => console.log(e));
  }

  subscribeVehicleUpdated(){
    this.VehicleDetailservice.subscribeVehicleVehicleUpdatedSubscription$()
    .pipe(
      map(subscription => subscription.data.VehicleVehicleUpdatedSubscription),
      takeUntil(this.ngUnsubscribe)
    )
    .subscribe((vehicle: any) => {
      this.checkIfEntityHasBeenUpdated(vehicle);
    });
  }

  checkIfEntityHasBeenUpdated(newvehicle){
    if (this.VehicleDetailservice.lastOperation === 'CREATE'){

      // Fields that will be compared to check if the entity was created
      if (newvehicle.generalInfo.name === this.VehicleDetailservice.vehicle.generalInfo.name
        && newvehicle.generalInfo.description === this.VehicleDetailservice.vehicle.generalInfo.description){
        // Show message entity created and redirect to the main page
        this.showSnackBar('VEHICLE.ENTITY_CREATED');
        this.router.navigate(['vehicle/']);
      }

    }else if (this.VehicleDetailservice.lastOperation === 'UPDATE'){
      // Just comparing the ids is enough to recognise if it is the same entity
      if (newvehicle._id === this.vehicle._id){
        // Show message entity updated and redirect to the main page
        this.showSnackBar('VEHICLE.ENTITY_UPDATED');
        this.router.navigate(['vehicle/']);
      }

    }else{
      if (this.vehicle != null && newvehicle._id === this.vehicle._id){
        // Show message indicating that the entity has been updated
        //this.showSnackBar('VEHICLE.ENTITY_UPDATED');
        this.router.navigate(['vehicle/']);
      }
    }
  }

  stopWaitingOperation(){
    this.ngUnsubscribe.pipe(
      take(1),
      mergeMap(() => this.VehicleDetailservice.resetOperation$())
    ).subscribe(val => {});
  }

  showSnackBar(message) {
    this.snackBar.open(this.translationLoader.getTranslate().instant(message),
      this.translationLoader.getTranslate().instant('VEHICLE.CLOSE'), {
        duration: 4000
      });
  }

  ngOnDestroy() {
    this.ngUnsubscribe.next();
    this.ngUnsubscribe.complete();
  }

}
