import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { marked, Renderer } from 'marked';
import { map } from 'rxjs/operators';
import { Observable } from 'rxjs';

export interface SubSection {
  id: string;
  title: string;
  level: number; // 3 or 4
}

export interface GuideSection {
  index: number;
  title: string;
  shortTitle: string;
  html: string;
  subSections: SubSection[];
}

export interface Guide {
  id: string;
  label: string;
  file: string;
  description: string;
}

export const GUIDES: Guide[] = [
  {
    id: 'beginner',
    label: 'Beginner Guide',
    file: '/docs/beginner-guide.md',
    description: 'Start here — web vitals, SSR basics, and hydration from scratch.',
  },
  {
    id: 'architect',
    label: 'Architect Deep Dive',
    file: '/docs/architect-deep-dive.md',
    description: 'Full technical depth — no simplifications. Signals, Zone.js, CRP, hydration internals.',
  },
  {
    id: 'topic-intro',
    label: 'Topic Introduction',
    file: '/docs/topic-introduction.md',
    description: 'For Angular devs who know the framework but not SSR or Web Vitals.',
  },
];

@Injectable({ providedIn: 'root' })
export class LearnContentService {
  private http = inject(HttpClient);

  loadGuide(file: string): Observable<GuideSection[]> {
    return this.http.get(file, { responseType: 'text' }).pipe(
      map(markdown => this.parseIntoSections(markdown))
    );
  }

  private slugify(text: string): string {
    return text.toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }

  private buildRenderer(): Renderer {
    const renderer = new Renderer();
    // Add id anchors to h3 and h4 so sub-section links work
    renderer.heading = ({ text, depth }: { text: string; depth: number }) => {
      if (depth === 1) {
        // Chapter title — no anchor needed
        return `<h1>${text}</h1>\n`;
      }
      // h2 (steps) and h3 (details) get anchor IDs for scroll-to
      const id = this.slugify(text);
      return `<h${depth} id="${id}" class="sub-heading">${text}</h${depth}>\n`;
    };
    return renderer;
  }

  private extractSubSections(sectionMarkdown: string): SubSection[] {
    const subSections: SubSection[] = [];
    const lines = sectionMarkdown.split('\n');
    for (const line of lines) {
      // ## = level 2 sub-section (step/topic), ### = level 3 (detail)
      const match = line.match(/^(##|###)\s+(.+)/);
      if (match) {
        const level = match[1].length; // 2 or 3
        const title = match[2].trim();
        subSections.push({ id: this.slugify(title), title, level });
      }
    }
    return subSections;
  }

  private parseIntoSections(markdown: string): GuideSection[] {
    const renderer = this.buildRenderer();
    const sections: GuideSection[] = [];

    // Split on # h1 headings — these are the chapters/parts/lessons
    // First split gives: [doc-title-block, chapter1, chapter2, ...]
    const rawSections = markdown.split(/\n(?=# (?!#))/);

    rawSections.forEach((section, index) => {
      // index 0 is the document title block — skip it
      if (index === 0) return;

      const titleMatch = section.match(/^# (.+)/m);
      if (!titleMatch) return;

      const fullTitle = titleMatch[1].trim();
      // "Chapter 1: How the Browser..." → "Chapter 1"
      // "Part 3: The Problem..." → "Part 3"
      // "Lesson 4: ..." → "Lesson 4"
      const shortTitle = fullTitle.replace(/:.*$/, '').trim();

      sections.push({
        index: sections.length,
        title: fullTitle,
        shortTitle,
        html: marked.parse(section, { renderer }) as string,
        subSections: this.extractSubSections(section),
      });
    });

    return sections;
  }
}
