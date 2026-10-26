import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
} from '@angular/core';

import { Chart } from 'chart.js/auto';

const LINE_COLOR = '#0b868f';

@Component({
  selector: 'app-line-chart',
  templateUrl: './line-chart.component.html',
  styleUrls: ['./line-chart.component.scss'],
})
export class LineChartComponent implements AfterViewInit, OnChanges, OnDestroy {

  @Input() labels: string[] = [];
  @Input() values: number[] = [];

  @Input() seriesLabel = '';

  @Input() axisLabel = '';

  @Input() description = '';

  @ViewChild('chartCanvas') private canvasRef?: ElementRef<HTMLCanvasElement>;

  private chart?: Chart<'line', number[], string>;

  ngAfterViewInit(): void {
    this.createChart();
  }

  ngOnChanges(): void {
    if (this.chart) {
      this.chart.data.labels = this.labels;
      this.chart.data.datasets[0].data = this.values;
      this.chart.data.datasets[0].label = this.seriesLabel;
      this.chart.update();
    }
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
    this.chart = undefined;
  }

  private createChart(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) {
      return;
    }

    this.chart = new Chart<'line', number[], string>(canvas, {
      type: 'line',
      data: {
        labels: this.labels,
        datasets: [
          {
            label: this.seriesLabel,
            data: this.values,
            borderColor: LINE_COLOR,
            backgroundColor: LINE_COLOR,
            tension: 0.1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            title: { display: this.axisLabel !== '', text: this.axisLabel },
          },
          y: {
            beginAtZero: true,
          },
        },
      },
    });
  }
}