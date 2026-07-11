/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type TripType = 'road-trip' | 'flights' | 'mixed';
export type TripStatus = 'draft' | 'dreaming' | 'planning' | 'booking' | 'upcoming' | 'active' | 'completed' | 'archived';
export type EventCategory = 'activity' | 'travel' | 'stay' | 'food' | 'logistics';
export type CollaboratorRole = 'owner' | 'editor' | 'viewer';

export interface Traveler {
  id: string;
  name: string;
  color: string; // e.g., "bg-red-500" or custom tailwind color text
  email?: string;
}

export interface Trip {
  id: string;
  title: string;
  destination: string;
  tripType: TripType;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  coverColor: string; // Tailwind bg color class
  petFriendly: boolean;
  status: TripStatus;
  statusOverride?: boolean; // If true, ignore automatic status progression
  collaborators: Record<string, CollaboratorRole>; // email -> role
  travelers?: Traveler[];
  schemaVersion: number;
  createdAt: string;
}

export interface ItineraryEvent {
  id: string;
  title: string;
  category: EventCategory;
  startDateTime: string; // ISO 8601 timezone-aware string, e.g., "2026-07-29T10:00:00.000-04:00"
  endDateTime: string; // ISO 8601 timezone-aware string, e.g., "2026-07-29T11:00:00.000-04:00"
  timezone: string; // IANA timezone string, e.g. "America/New_York"
  locationName: string;
  address?: string;
  coordinates?: { lat: number; lng: number };
  notes?: string;
  reservationNumber?: string;
  dogFriendly?: boolean; // Only if trip.petFriendly is true
  fileUrl?: string; // Attachment URL or Base64
  fileName?: string;
  isAnchor?: boolean; // Sets whether this is an anchor event
  timeUnknown?: boolean;
  travelerIds?: string[];
  source?: 'manual' | 'wizard' | 'anchor' | 'ai-suggested';
}

export interface Day {
  id: string; // e.g. "day-1", "day-2" or YYYY-MM-DD
  dateStr: string; // YYYY-MM-DD
  title?: string;
}

export interface UserSession {
  email: string | null;
  displayName: string | null;
  uid: string | null;
  isAnonymous: boolean;
}
