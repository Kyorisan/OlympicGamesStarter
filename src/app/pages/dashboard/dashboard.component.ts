import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, combineLatest, map } from 'rxjs';

import { CountryMedals } from '../../models/country-medals.model';
import { Indicator } from '../../models/indicator.model';
import { ViewState } from '../../models/view-state.model';
import { DataService } from '../../services/data.service';

interface DashboardViewModel {
  state: ViewState;
  medals: CountryMedals[];
  labels: string[];
  values: number[];
  indicators: Indicator[];
  description: string;
}

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})

export class DashboardComponent {
  readonly title = 'Medals per Country';

  readonly vm$: Observable<DashboardViewModel> = combineLatest({
    state: this.data.getState(),
    medals: this.data.getMedalsByCountry(),
    countryCount: this.data.getCountryCount(),
    gameCount: this.data.getGameCount(),
  }).pipe(
    map(({ state, medals, countryCount, gameCount }) => ({
      state,
      medals,
      labels: medals.map((medal) => medal.country),
      values: medals.map((medal) => medal.total),
      indicators: [
        { label: 'Number of JOs', value: gameCount },
        { label: 'Number of countries', value: countryCount },
      ],
      description: this.buildDescription(medals),
    }))
  );

  constructor(
    private readonly data: DataService,
    private readonly router: Router
  ) {}

  onCountrySelected(index: number, medals: CountryMedals[]): void {
    const selected = medals[index];
    if (selected) {
      this.router.navigate(['/country', selected.id]);
    }
  }

  private buildDescription(medals: CountryMedals[]): string {
    if (medals.length === 0) {
      return 'Aucune donnée à représenter.';
    }

    const parts = medals.map((medal) => `${medal.country} (${medal.total})`).join(', ');
    return `Nombre de médailles par pays : ${parts}`;
  }
}