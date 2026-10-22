import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StatePanelComponent } from './state-panel.component';

describe('StatePanelComponent', () => {
  let component: StatePanelComponent;
  let fixture: ComponentFixture<StatePanelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StatePanelComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(StatePanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
