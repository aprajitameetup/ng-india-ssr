import { Routes } from '@angular/router';

/**
 * Client-side routing — lazy-loaded feature routes.
 * Render modes are declared separately in app.routes.server.ts.
 */
export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/home/home').then(m => m.HomeComponent),
  },
  {
    path: 'products',
    loadComponent: () => import('./features/products/product-list/product-list').then(m => m.ProductListComponent),
  },
  {
    path: 'products/:slug',
    loadComponent: () => import('./features/products/product-detail/product-detail').then(m => m.ProductDetailComponent),
  },
  {
    path: 'category/:name',
    loadComponent: () => import('./features/category/category').then(m => m.CategoryComponent),
  },
  {
    path: 'cart',
    loadComponent: () => import('./features/cart/cart').then(m => m.CartComponent),
  },
  {
    path: 'learn',
    loadComponent: () => import('./features/learn/learn').then(m => m.LearnComponent),
  },
  {
    path: 'issues',
    loadComponent: () => import('./features/issues/issues').then(m => m.IssuesComponent),
  },
  {
    path: 'case-studies',
    loadComponent: () => import('./features/case-studies/case-studies').then(m => m.CaseStudiesComponent),
  },
  {
    path: '**',
    redirectTo: '',
  },
];
