interface LocatedCase {
  category: string;
  report: {
    id: string;
    latitude: number | null;
    longitude: number | null;
  };
}

export interface NearbyCaseGroup<T> {
  cases: T[];
  category: string;
  latitude: number | null;
  longitude: number | null;
}

const EARTH_RADIUS_METERS = 6_371_000;

function distanceMeters(
  first: { latitude: number; longitude: number },
  second: { latitude: number; longitude: number },
) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(second.latitude - first.latitude);
  const longitudeDelta = radians(second.longitude - first.longitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(first.latitude)) *
      Math.cos(radians(second.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(haversine));
}

export function groupNearbyCases<T extends LocatedCase>(
  cases: T[],
  radiusMeters = 100,
): NearbyCaseGroup<T>[] {
  const groups: NearbyCaseGroup<T>[] = [];

  for (const item of cases) {
    const { latitude, longitude } = item.report;
    const group =
      latitude == null || longitude == null
        ? undefined
        : groups.find(
            (candidate) =>
              candidate.category === item.category &&
              candidate.latitude != null &&
              candidate.longitude != null &&
              distanceMeters(
                { latitude, longitude },
                {
                  latitude: candidate.latitude,
                  longitude: candidate.longitude,
                },
              ) <= radiusMeters,
          );

    if (group) {
      group.cases.push(item);
    } else {
      groups.push({
        cases: [item],
        category: item.category,
        latitude,
        longitude,
      });
    }
  }

  return groups;
}
