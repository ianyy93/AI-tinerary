/**
 * Infers an IANA timezone identifier from a destination name / location string.
 */
export function inferTimezone(destination?: string): string {
  if (!destination) return 'America/New_York';
  const dest = destination.toLowerCase();

  // Arizona / Phoenix / Sedona
  if (dest.includes('arizona') || dest.includes('phoenix') || dest.includes('sedona') || dest.includes('grand canyon')) {
    return 'America/Phoenix';
  }
  // Mountain Time (Denver, Utah, Salt Lake City, Colorado, Montana, Wyoming, etc.)
  if (dest.includes('denver') || dest.includes('colorado') || dest.includes('utah') || dest.includes('salt lake') || dest.includes('montana') || dest.includes('wyoming') || dest.includes('aspen') || dest.includes('vail') || dest.includes('rocky mountain')) {
    return 'America/Denver';
  }
  // Pacific Time (California, Oregon, Washington, Los Angeles, San Francisco, Seattle, Portland, Vegas, Nevada)
  if (dest.includes('california') || dest.includes('los angeles') || dest.includes('san francisco') || dest.includes('seattle') || dest.includes('portland') || dest.includes('vegas') || dest.includes('las vegas') || dest.includes('nevada') || dest.includes('oregon') || dest.includes('washington') || dest.includes('san diego') || dest.includes('tahoe')) {
    return 'America/Los_Angeles';
  }
  // Central Time (Chicago, Texas, Austin, Dallas, Houston, New Orleans, Nashville, Tennessee, Illinois, Minnesota)
  if (dest.includes('chicago') || dest.includes('texas') || dest.includes('austin') || dest.includes('dallas') || dest.includes('houston') || dest.includes('new orleans') || dest.includes('nashville') || dest.includes('tennessee') || dest.includes('illinois') || dest.includes('minnesota') || dest.includes('louisiana')) {
    return 'America/Chicago';
  }
  // Eastern Time (New York, Florida, Miami, Boston, Atlanta, Georgia, DC, Washington DC, Orlando, Maine, Massachusetts)
  if (dest.includes('new york') || dest.includes('nyc') || dest.includes('florida') || dest.includes('miami') || dest.includes('boston') || dest.includes('atlanta') || dest.includes('georgia') || dest.includes('washington dc') || dest.includes('orlando') || dest.includes('maine') || dest.includes('massachusetts') || dest.includes('brooklyn') || dest.includes('philadelphia')) {
    return 'America/New_York';
  }
  // Hawaii
  if (dest.includes('hawaii') || dest.includes('honolulu') || dest.includes('maui') || dest.includes('oahu') || dest.includes('kauai')) {
    return 'Pacific/Honolulu';
  }
  // Alaska
  if (dest.includes('alaska') || dest.includes('anchorage')) {
    return 'America/Anchorage';
  }
  // Europe
  if (dest.includes('london') || dest.includes('uk') || dest.includes('united kingdom') || dest.includes('england')) {
    return 'Europe/London';
  }
  if (dest.includes('paris') || dest.includes('france')) {
    return 'Europe/Paris';
  }
  if (dest.includes('rome') || dest.includes('italy') || dest.includes('milan') || dest.includes('venice') || dest.includes('florence')) {
    return 'Europe/Rome';
  }
  if (dest.includes('berlin') || dest.includes('germany') || dest.includes('munich') || dest.includes('frankfurt')) {
    return 'Europe/Berlin';
  }
  if (dest.includes('madrid') || dest.includes('spain') || dest.includes('barcelona')) {
    return 'Europe/Madrid';
  }
  if (dest.includes('amsterdam') || dest.includes('netherlands') || dest.includes('holland')) {
    return 'Europe/Amsterdam';
  }
  // Asia
  if (dest.includes('tokyo') || dest.includes('japan') || dest.includes('kyoto') || dest.includes('osaka')) {
    return 'Asia/Tokyo';
  }
  if (dest.includes('singapore')) {
    return 'Asia/Singapore';
  }
  if (dest.includes('seoul') || dest.includes('korea')) {
    return 'Asia/Seoul';
  }
  if (dest.includes('bangkok') || dest.includes('thailand') || dest.includes('phuket')) {
    return 'Asia/Bangkok';
  }
  // Australia
  if (dest.includes('sydney') || dest.includes('australia') || dest.includes('melbourne') || dest.includes('brisbane') || dest.includes('cairns')) {
    return 'Australia/Sydney';
  }

  return 'America/New_York';
}
