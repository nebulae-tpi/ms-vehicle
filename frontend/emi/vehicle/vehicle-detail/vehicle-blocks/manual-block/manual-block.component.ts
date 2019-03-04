import { Component, OnInit, Inject} from '@angular/core';
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material';

import { AbstractControl } from '@angular/forms';


import {
  FormBuilder,
  FormGroup,
  FormControl,
  Validators,
  FormArray
} from '@angular/forms';

@Component({
// tslint:disable-next-line: component-selector
  selector: 'manual-block-dialog.component',
  templateUrl: './manual-block.component.html',
  styleUrls: ['./manual-block.component.scss']
})
export class ManualBlockDialogComponent implements OnInit {

  manualBlockForm: any;
  blockTypes = [
    { key: 'EXPIRED_MEMBERSHIP', duration: undefined },
    { key: 'OTHER', duration: undefined },
  ];
  forbidddenBlockKeys = [];
  mode: string;
  block: any;

  constructor(
    private dialogRef: MatDialogRef<ManualBlockDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any) {
      console.log('forbidddenBlockKeys ==>', data.forbidddenBlockKeys);
      this.forbidddenBlockKeys = data.forbidddenBlockKeys;
      this.mode = data.mode;
      this.block = data.block;
  }

  ngOnInit() {
    console.log('MANUAL BLOCK DIALOG COMPONENT ON NG_ON_INIT');
    this.manualBlockForm = new FormGroup({
      block: new FormControl(null, [Validators.required, this.validateBlock.bind(this) ]),
      duration: new FormControl(0),
      comment: new FormControl(''),
    });
  }

  validateBlock(control: AbstractControl) {

    console.log('validateBlock-control', control.value);
    console.log('validateBlock-forbidddenBlockKeys', this.forbidddenBlockKeys);
    if (control.value && this.forbidddenBlockKeys.includes(control.value.key)){
      return { blockExist: true };
    }
    return null;
  }

  pushButton(okButton: Boolean) {
    if (okButton) {
      const rawValueForm = this.manualBlockForm.getRawValue();
      const response = {
        key: rawValueForm.block.key,
        startTime: Date.now(),
        endTime: Date.now() + rawValueForm.block.duration,
        notes: rawValueForm.comment
      };
      this.dialogRef.close(response);
    } else {
      this.dialogRef.close(false);
    }
  }

}
