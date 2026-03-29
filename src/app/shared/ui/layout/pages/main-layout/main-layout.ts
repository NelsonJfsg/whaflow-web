import { DOCUMENT } from '@angular/common';
import { Component, OnDestroy, effect, inject, signal } from '@angular/core';
import { Sidebar } from '../../components/sidebar/sidebar';
import { Navbar } from "../../components/navbar/navbar";
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'ui-main-layout',
  imports: [
    Sidebar,
    Navbar,
    RouterOutlet
],
  templateUrl: './main-layout.html',
  styleUrl: './main-layout.css',
})
export class MainLayout implements OnDestroy {
  private readonly documentRef = inject(DOCUMENT);
  private isBodyScrollLocked = false;
  private lockedScrollY = 0;

  public isSidebarCollapsed  = signal(true);

  constructor() {
    effect(() => {
      const isOpen = !this.isSidebarCollapsed();
      const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;
      this.syncBodyScrollLock(isOpen && isMobile);
    });
  }

  public closeSidebar(): void {
    this.isSidebarCollapsed.set(true);
  }

  ngOnDestroy(): void {
    this.unlockBodyScroll();
  }

  private syncBodyScrollLock(shouldLock: boolean): void {
    if (shouldLock) {
      this.lockBodyScroll();
      return;
    }

    this.unlockBodyScroll();
  }

  private lockBodyScroll(): void {
    if (this.isBodyScrollLocked || typeof window === 'undefined') {
      return;
    }

    const body = this.documentRef.body;
    this.lockedScrollY = window.scrollY || this.documentRef.documentElement.scrollTop || 0;

    body.classList.add('sidebar-scroll-lock');
    body.style.position = 'fixed';
    body.style.top = `-${this.lockedScrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    body.style.overflow = 'hidden';

    this.isBodyScrollLocked = true;
  }

  private unlockBodyScroll(): void {
    if (!this.isBodyScrollLocked || typeof window === 'undefined') {
      return;
    }

    const body = this.documentRef.body;
    body.classList.remove('sidebar-scroll-lock');
    body.style.removeProperty('position');
    body.style.removeProperty('top');
    body.style.removeProperty('left');
    body.style.removeProperty('right');
    body.style.removeProperty('width');
    body.style.removeProperty('overflow');

    window.scrollTo(0, this.lockedScrollY);
    this.isBodyScrollLocked = false;
  }
}
