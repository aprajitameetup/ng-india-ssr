import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavComponent } from './shared/components/nav/nav';

/**
 * Root application component.
 * Renders the nav bar and the router outlet.
 * All SSR/hydration magic happens in child components and route configs.
 */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NavComponent],
  template: `
    <app-nav />
    <main>
      <router-outlet />
    </main>
  `,
  styles: [`
    :host { display: block; min-height: 100vh; background: #f8fafc; }
    main { min-height: calc(100vh - 64px); }
  `],
})
export class App {}
