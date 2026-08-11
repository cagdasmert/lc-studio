import type { Template } from '../../types/template';
import { kineticTextOpener } from './kinetic-text';
import { quoteCard } from './quote-card';
import { countdown } from './countdown';
import { productHighlight } from './product-highlight';
import { announcementTeaser } from './announcement-teaser';

export const BUILT_IN_TEMPLATES: Template[] = [
  kineticTextOpener,
  quoteCard,
  countdown,
  productHighlight,
  announcementTeaser,
];
