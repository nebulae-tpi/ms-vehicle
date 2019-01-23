////////// ANGULAR //////////
import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  Input
} from '@angular/core';

import {
  FormBuilder,
  FormGroup,
  FormControl,
  Validators,
  FormArray
} from '@angular/forms';

import { Router, ActivatedRoute } from '@angular/router';

////////// RXJS ///////////
import {
  map,
  mergeMap,
  switchMap,
  toArray,
  filter,
  tap,
  takeUntil,
  startWith,
  debounceTime,
  distinctUntilChanged,
  take
} from 'rxjs/operators';

import { Subject, fromEvent, of, forkJoin, Observable, concat, combineLatest } from 'rxjs';

//////////// ANGULAR MATERIAL ///////////
import {
  MatPaginator,
  MatSort,
  MatTableDataSource,
  MatSnackBar,
  MatDialog
} from '@angular/material';

//////////// i18n ////////////
import {
  TranslateService
} from '@ngx-translate/core';
import { locale as english } from '../../i18n/en';
import { locale as spanish } from '../../i18n/es';
import { FuseTranslationLoaderService } from '../../../../../core/services/translation-loader.service';

//////////// Others ////////////
import { KeycloakService } from 'keycloak-angular';
import { VehicleDetailService } from '../vehicle-detail.service';
import { DialogComponent } from '../../dialog/dialog.component';
import { ToolbarService } from '../../../../toolbar/toolbar.service';

@Component({
  // tslint:disable-next-line:component-selector
  selector: 'vehicle-features',
  templateUrl: './vehicle-features.component.html',
  styleUrls: ['./vehicle-features.component.scss']
})
// tslint:disable-next-line:class-name
export class VehicleDetailFeaturesComponent implements OnInit, OnDestroy {
  // Subject to unsubscribe
  private ngUnsubscribe = new Subject();

  @Input('pageType') pageType: string;
  @Input('vehicle') vehicle: any;

  otherFeatures = ['AC', 'TRUNK', 'ROOF_RACK', 'PETS', 'BIKE_RACK' ];

  vehicleFeaturesForm: any;
  blockings = `Nikola Tesla Industrial.`.split(' ');
  fuelTypes = ['GASOLINE', 'GAS', 'GASOLINE_AND_GAS', 'DIESEL'];

  constructor(
    private translationLoader: FuseTranslationLoaderService,
    private translate: TranslateService,
    private formBuilder: FormBuilder,
    public snackBar: MatSnackBar,
    private router: Router,
    private activatedRouter: ActivatedRoute,
    private VehicleDetailservice: VehicleDetailService,
    private dialog: MatDialog,
    private toolbarService: ToolbarService
  ) {
      this.translationLoader.loadTranslations(english, spanish);
  }


  ngOnInit() {
    this.vehicleFeaturesForm = new FormGroup({
      fuel: new FormControl(this.vehicle ? (this.vehicle.features || {}).fuel : ''),
      capacity: new FormControl(this.vehicle ? (this.vehicle.features || {}).capacity : ''),
      others : new FormArray([])
    });

    if (this.vehicle.features){
      this.vehicle.features.others.forEach(feature => {
        (this.vehicleFeaturesForm.get('others') as FormArray).push(
          new FormGroup({
            name: new FormControl(feature.name),
            active: new FormControl(feature.active)
          })
        );
      });
    }



    this.otherFeatures.forEach(featureKey => {
      const featureControl = (this.vehicleFeaturesForm.get('others') as FormArray).controls.find(control => control.get('name').value === featureKey);
      if (!featureControl){
        (this.vehicleFeaturesForm.get('others') as FormArray).push(
          new FormGroup({
            name: new FormControl(featureKey),
            active: new FormControl(false)
          })
        );
      }
    });



  }


  updateVehicleFeatures() {
    this.showConfirmationDialog$('VEHICLE.UPDATE_MESSAGE', 'VEHICLE.UPDATE_TITLE')
      .pipe(
        mergeMap(ok =>
          this.VehicleDetailservice.updateVehicleVehicleFeatures$(this.vehicle._id, {
            fuel: this.vehicleFeaturesForm.getRawValue().fuel,
            capacity: this.vehicleFeaturesForm.getRawValue().capacity,
            others: this.vehicleFeaturesForm.getRawValue().others
          })
        ),
        mergeMap(resp => this.graphQlAlarmsErrorHandler$(resp)),
        filter((resp: any) => !resp.errors || resp.errors.length === 0),
        takeUntil(this.ngUnsubscribe)
      )
      .subscribe(result => {
        this.showSnackBar('VEHICLE.WAIT_OPERATION');
      },
        error => {
          this.showSnackBar('VEHICLE.ERROR_OPERATION');
          console.log('Error ==> ', error);
        }
      );

  }


  showConfirmationDialog$(dialogMessage, dialogTitle) {
    return this.dialog
      // Opens confirm dialog
      .open(DialogComponent, {
        data: {
          dialogMessage,
          dialogTitle
        }
      })
      .afterClosed()
      .pipe(
        filter(okButton => okButton),
      );
  }

  showSnackBar(message) {
    this.snackBar.open(this.translationLoader.getTranslate().instant(message),
      this.translationLoader.getTranslate().instant('VEHICLE.CLOSE'), {
        duration: 6000
      });
  }

  graphQlAlarmsErrorHandler$(response) {
    return of(JSON.parse(JSON.stringify(response)))
      .pipe(
        tap((resp: any) => {
          this.showSnackBarError(resp);

          return resp;
        })
      );
  }

  /**
   * Shows an error snackbar
   * @param response
   */
  showSnackBarError(response) {
    if (response.errors) {

      if (Array.isArray(response.errors)) {
        response.errors.forEach(error => {
          if (Array.isArray(error)) {
            error.forEach(errorDetail => {
              this.showMessageSnackbar('ERRORS.' + errorDetail.message.code);
            });
          } else {
            response.errors.forEach( err => {
              this.showMessageSnackbar('ERRORS.' + err.message.code);
            });
          }
        });
      }
    }
  }

  /**
   * Shows a message snackbar on the bottom of the page
   * @param messageKey Key of the message to i18n
   * @param detailMessageKey Key of the detail message to i18n
   */
  showMessageSnackbar(messageKey, detailMessageKey?) {
    const translationData = [];
    if (messageKey) {
      translationData.push(messageKey);
    }

    if (detailMessageKey) {
      translationData.push(detailMessageKey);
    }

    this.translate.get(translationData)
      .subscribe(data => {
        this.snackBar.open(
          messageKey ? data[messageKey] : '',
          detailMessageKey ? data[detailMessageKey] : '',
          {
            duration: 2000
          }
        );
      });
  }

  ngOnDestroy() {
    this.ngUnsubscribe.next();
    this.ngUnsubscribe.complete();
  }

}
