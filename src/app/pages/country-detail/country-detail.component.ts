import { Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Observable, combineLatest, map, switchMap } from 'rxjs';

import { Indicator } from '../../models/indicator.model';
import { Olympic } from '../../models/olympic.model';
import { ViewState } from '../../models/view-state.model';
import { DataService } from '../../services/data.service';

interface CountryDetailViewModel {
  state: ViewState;
  title: string;
  indicators: Indicator[];
  labels: string[];
  values: number[];
  description: string;
  message: string;
}

const EMPTY_VIEW: CountryDetailViewModel = {
  state: 'empty',
  title: '',
  indicators: [],
  labels: [],
  values: [],
  description: '',
  message: '',
};

@Component({
  selector: 'app-country-detail',
  templateUrl: './country-detail.component.html',
  styleUrls: ['./country-detail.component.scss'],
})

export class CountryDetailComponent {
  readonly vm$: Observable<CountryDetailViewModel> = this.route.paramMap.pipe(
    map((params) => Number(params.get('id'))),
    switchMap((id) =>
      combineLatest({
        state: this.data.getState(),
        olympic: this.data.getOlympicById(id),
      })
    ),
    map(({ state, olympic }) => this.toViewModel(state, olympic))
  );

  constructor(
    private readonly route: ActivatedRoute,
    private readonly data: DataService
  ) {}

  private toViewModel(state: ViewState, 
    olympic: Olympic | undefined): CountryDetailViewModel {

      if (state !== 'loaded') {
        return { ...EMPTY_VIEW, state };
      }

      if (!olympic) {
        return {
          ...EMPTY_VIEW,
          message: "Ce pays n'existe pas.",
        };
      }

    const participations = [...olympic.participations].sort(
      (a, b) => a.year - b.year
    );

    return {
      state: 'loaded',
      title: olympic.country,
      indicators: [
        { label: 'Number of entries', value: participations.length },
        { label: 'Total number medals', value: this.data.sumMedals(olympic) },
        {
          label: 'Total number of athletes',
          value: this.data.sumAthletes(olympic),
        },
      ],
      labels: participations.map((participation) => String(participation.year)),
      values: participations.map(
        (participation) => participation.medalsCount
      ),
      description: `Évolution du nombre de médailles de ${olympic.country} — ${participations
        .map((participation) => `${participation.year} : ${participation.medalsCount}`)
        .join(', ')}.`,
      message: '',
    };
  }
}
