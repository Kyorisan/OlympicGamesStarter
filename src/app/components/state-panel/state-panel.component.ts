import { Component, Input } from '@angular/core';

import { ViewState } from '../../models/view-state.model';

@Component({
  selector: 'app-state-panel',
  templateUrl: './state-panel.component.html',
  styleUrls: ['./state-panel.component.scss'],
})

export class StatePanelComponent {
  @Input() state: ViewState = 'loading';

  @Input() message = '';

  @Input() showBackLink = false;

  get emptyMessage(): string {
    return this.message || 'Aucune donnée disponible.';
  }

  get errorMessage(): string {
    return this.message || 'Les données n\'ont pas chargées.';
  }
}