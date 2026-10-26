import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, map } from 'rxjs';

import { environment } from '../../environments/environment';
import { CountryMedals } from '../models/country-medals.model';
import { Olympic } from '../models/olympic.model';
import { ViewState } from '../models/view-state.model';

@Injectable({ providedIn: 'root' })
export class DataService {
  private readonly olympics$ = new BehaviorSubject<Olympic[]>([]);
  private readonly state$ = new BehaviorSubject<ViewState>('loading');

  private loadTriggered = false;

  constructor(private readonly http: HttpClient) {}

  getOlympics(): Observable<Olympic[]> {
    this.load();
    return this.olympics$.asObservable();
  }

  getState(): Observable<ViewState> {
    this.load();
    return this.state$.asObservable();
  }

  getOlympicById(id: number): Observable<Olympic | undefined> {
    return this.getOlympics().pipe(
      map((olympics) => olympics.find((olympic) => olympic.id === id))
    );
  }

  getCountryCount(): Observable<number> {
    return this.getOlympics().pipe(map((olympics) => olympics.length));
  }

  getGameCount(): Observable<number> {
    return this.getOlympics().pipe(
      map((olympics) => {
        const years = new Set<number>();
        for (const olympic of olympics) {
          for (const participation of olympic.participations) {
            years.add(participation.year);
          }
        }
        return years.size;
      })
    );
  }

  getMedalsByCountry(): Observable<CountryMedals[]> {
    return this.getOlympics().pipe(
      map((olympics) =>
        olympics
          .map((olympic) => ({
            id: olympic.id,
            country: olympic.country,
            total: this.sumMedals(olympic),
          }))
          .sort((a, b) => a.country.localeCompare(b.country))
      )
    );
  }

  sumMedals(olympic: Olympic): number {
    return olympic.participations.reduce(
      (total, participation) => total + participation.medalsCount,
      0
    );
  }

  sumAthletes(olympic: Olympic): number {
    return olympic.participations.reduce(
      (total, participation) => total + participation.athleteCount,
      0
    );
  }

  private load(): void {
    if (this.loadTriggered) {
      return;
    }
    this.loadTriggered = true;

    this.http.get<Olympic[]>(environment.apiUrl).subscribe({
      next: (olympics) => {
        this.olympics$.next(olympics);
        this.state$.next(olympics.length > 0 ? 'loaded' : 'empty');
      },
      error: () => {
        this.olympics$.next([]);
        this.state$.next('error');
      },
    });
  }
}