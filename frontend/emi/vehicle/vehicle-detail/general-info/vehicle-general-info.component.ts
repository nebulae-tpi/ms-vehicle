////////// ANGULAR //////////
import {
  Component,
  OnInit,
  OnDestroy,
  Input
} from '@angular/core';

import {
  FormGroup,
  FormControl,
} from '@angular/forms';


////////// RXJS ///////////
import {
  mergeMap,
  filter,
  tap,
  takeUntil,
  take
} from 'rxjs/operators';

import { Subject, of } from 'rxjs';

//////////// ANGULAR MATERIAL ///////////
import {
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
import { VehicleDetailService } from '../vehicle-detail.service';
import { DialogComponent } from '../../dialog/dialog.component';
import { ToolbarService } from '../../../../toolbar/toolbar.service';

@Component({
  // tslint:disable-next-line:component-selector
  selector: 'vehicle-general-info',
  templateUrl: './vehicle-general-info.component.html',
  styleUrls: ['./vehicle-general-info.component.scss']
})
// tslint:disable-next-line:class-name
export class VehicleDetailGeneralInfoComponent implements OnInit, OnDestroy {
  // Subject to unsubscribe
  private ngUnsubscribe = new Subject();

  @Input('pageType') pageType: string;
  @Input('vehicle') vehicle: any;

  vehicleGeneralInfoForm: any;
  vehicleStateForm: any;

  constructor(
    private translationLoader: FuseTranslationLoaderService,
    private translate: TranslateService,
    public snackBar: MatSnackBar,
    private VehicleDetailservice: VehicleDetailService,
    private dialog: MatDialog,
    private toolbarService: ToolbarService
  ) {
      this.translationLoader.loadTranslations(english, spanish);

  }


  ngOnInit() {
    this.vehicleGeneralInfoForm = new FormGroup({
      licensePlate: new FormControl(this.vehicle ? (this.vehicle.generalInfo || {}).licensePlate : ''),
      model: new FormControl(this.vehicle ? (this.vehicle.generalInfo || {}).model : ''),
      brand: new FormControl(this.vehicle ? (this.vehicle.generalInfo || {}).brand : ''),
      line: new FormControl(this.vehicle ? (this.vehicle.generalInfo || {}).line : '')
    });

    this.vehicleStateForm = new FormGroup({
      state: new FormControl(this.vehicle ? this.vehicle.state : true)
    });
  }

  createVehicle() {
    this.toolbarService.onSelectedBusiness$
    .pipe(
      tap(selectedBusiness => {
        if (!selectedBusiness || selectedBusiness.id == null){
          this.showSnackBar('VEHICLE.SELECT_BUSINESS');
        }
      }),
      take(1),
      filter(selectedBusiness => selectedBusiness != null && selectedBusiness.id != null),
      mergeMap(selectedBusiness => this.showConfirmationDialog$('VEHICLE.CREATE_MESSAGE', 'VEHICLE.CREATE_TITLE', {})
        .pipe(
          mergeMap(ok => {
            this.vehicle = {
              generalInfo: {
                ...this.vehicleGeneralInfoForm.getRawValue(),
                licensePlate: this.vehicleGeneralInfoForm.getRawValue().licensePlate.trim().toUpperCase(),
                brand: this.vehicleGeneralInfoForm.getRawValue().brand.trim().toUpperCase(),
                line: this.vehicleGeneralInfoForm.getRawValue().line.trim().toUpperCase()

              },
              state: this.vehicleStateForm.getRawValue().state,
              businessId: selectedBusiness.id
            };
            return this.VehicleDetailservice.createVehicleVehicle$(this.vehicle);
          }),
          mergeMap(resp => this.graphQlAlarmsErrorHandler$(resp)),
          filter((resp: any) => !resp.errors || resp.errors.length === 0),
        )),
      takeUntil(this.ngUnsubscribe)
    )
      .subscribe(() => {
        this.showSnackBar('VEHICLE.WAIT_OPERATION');
      },
        error => {
          this.showSnackBar('VEHICLE.ERROR_OPERATION');
          console.log('Error ==> ', error);
        },
        () => console.log('COMPLETED')
      );
  }

  updateVehicleGeneralInfo() {
    this.showConfirmationDialog$('VEHICLE.UPDATE_MESSAGE', 'VEHICLE.UPDATE_TITLE', {})
      .pipe(
        mergeMap(() => this.VehicleDetailservice.updateVehicleVehicleGeneralInfo$(
          this.vehicle._id, {
            licensePlate: this.vehicleGeneralInfoForm.getRawValue().licensePlate.trim().toUpperCase(),
            model: this.vehicleGeneralInfoForm.getRawValue().model,
            brand: this.vehicleGeneralInfoForm.getRawValue().brand.trim().toUpperCase(),
            line: this.vehicleGeneralInfoForm.getRawValue().line.trim().toUpperCase()
          }
        )),
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

  onVehicleStateChange(checker: any) {
    if (this.pageType === 'new') {
      return;
    }
    this.showConfirmationDialog$('VEHICLE.UPDATE_MESSAGE', 'VEHICLE.UPDATE_TITLE', {checker})
      .pipe(
        mergeMap(ok => this.VehicleDetailservice.updateVehicleVehicleState$(this.vehicle._id, this.vehicleStateForm.getRawValue().state)),
        mergeMap(resp => this.graphQlAlarmsErrorHandler$(resp)),
        filter((resp: any) => !resp.errors || resp.errors.length === 0),
        takeUntil(this.ngUnsubscribe)
      ).subscribe(result => {
        this.showSnackBar('VEHICLE.WAIT_OPERATION');
      },
        error => {
          this.showSnackBar('VEHICLE.ERROR_OPERATION');
          console.log('Error ==> ', error);
        });
  }

  showConfirmationDialog$(dialogMessage, dialogTitle, other) {
    return this.dialog.open(DialogComponent, {
      data: {
        dialogMessage,
        dialogTitle
      }
    })
      .afterClosed()
      .pipe(
        tap(userResponse => {
          // console.log('RESPUESTA EL CIERRE DEL DIALOG', userResponse, 'ESTADO DEL FORM', this.vehicleStateForm.controls['state'].value);
          if (!userResponse && other.checker ){
            console.log('ESTADO DEL CHECKER ==> ', other);
            console.log('REVERTIR EL ESTADO DEL CHECKER..');

          }

        } ),
        filter(okButton => okButton)
      );
  }

  showSnackBar(message) {
    this.snackBar.open(this.translationLoader.getTranslate().instant(message),
      this.translationLoader.getTranslate().instant('VEHICLE.CLOSE'), {
        duration: 6000
      });
  }

  graphQlAlarmsErrorHandler$(response) {
    return of(JSON.parse(JSON.stringify(response))).pipe(
      tap((resp: any) => {
        if (response && Array.isArray(response.errors)) {
          response.errors.forEach(error => {
            this.showMessageSnackbar('ERRORS.' + ((error.extensions||{}).code || 1) )
          });
        }
        return resp;
      })
    );
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
            duration: 4000
          }
        );
      });
  }



  ngOnDestroy() {
    this.ngUnsubscribe.next();
    this.ngUnsubscribe.complete();
  }

}
