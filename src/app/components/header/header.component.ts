import { Component, Input } from '@angular/core';

import { Indicator } from 'src/app/models/indicator.model';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
})
export class HeaderComponent {

  @Input() title = '';

  @Input() indicators: Indicator[] = [];
}
