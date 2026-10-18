"""Build the outage fallback from a downloaded OSM PBF extract (requires osmium)."""

import argparse
import gzip
import json
from pathlib import Path

import osmium


class Facilities(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.elements = {}
        self.ways = {}
        self.wanted_nodes = set()

    def tags(self, obj):
        tags = dict(obj.tags)
        if tags.get("amenity") not in {"police", "fire_station", "hospital"} and tags.get(
            "emergency"
        ) not in {"rescue_station", "disaster_response"}:
            return None
        return {
            k: v
            for k, v in tags.items()
            if k
            in {
                "amenity",
                "emergency",
                "name",
                "name:en",
                "phone",
                "contact:phone",
                "disused",
                "abandoned",
                "access",
            }
            or k.startswith("addr:")
        }

    def node(self, node):
        tags = self.tags(node)
        if tags and node.location.valid():
            self.elements[f"node/{node.id}"] = {
                "type": "node",
                "id": node.id,
                "lat": node.lat,
                "lon": node.lon,
                "tags": tags,
            }

    def way(self, way):
        tags = self.tags(way)
        if tags:
            refs = [int(node.ref) for node in way.nodes]
            self.ways[int(way.id)] = (refs, tags)
            self.wanted_nodes.update(refs)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pbf", type=Path)
    parser.add_argument("--source-url", required=True)
    parser.add_argument("--output", type=Path, default=Path("data/nearby-facilities.json.gz"))
    args = parser.parse_args()
    with osmium.io.Reader(str(args.pbf)) as reader:
        header = reader.header()
        timestamp = header.get("osmosis_replication_timestamp")
        bounds = header.get("bounds")
    if not timestamp:
        raise ValueError("Extract has no OSM replication timestamp")
    handler = Facilities()
    print("Collecting facility nodes and way references…", flush=True)
    facility_filter = osmium.filter.TagFilter(
        ("amenity", "police"),
        ("amenity", "fire_station"),
        ("amenity", "hospital"),
        ("emergency", "rescue_station"),
        ("emergency", "disaster_response"),
    )
    handler.apply_file(str(args.pbf), filters=[facility_filter])
    coordinates = {}

    class ReferencedNodes(osmium.SimpleHandler):
        def node(self, node):
            identifier = int(node.id)
            if identifier in handler.wanted_nodes and node.location.valid():
                coordinates[identifier] = (node.lat, node.lon)

    print(f"Resolving coordinates for {len(handler.wanted_nodes):,} facility-way nodes…", flush=True)
    node_filter = osmium.filter.IdFilter(handler.wanted_nodes).enable_for(osmium.osm.NODE)
    ReferencedNodes().apply_file(str(args.pbf), filters=[node_filter])
    for identifier, (refs, tags) in handler.ways.items():
        nodes = [coordinates[ref] for ref in refs if ref in coordinates]
        if not nodes:
            continue
        lats, lons = [point[0] for point in nodes], [point[1] for point in nodes]
        handler.elements[f"way/{identifier}"] = {
            "type": "way",
            "id": identifier,
            "tags": tags,
            "center": {"lat": (min(lats) + max(lats)) / 2, "lon": (min(lons) + max(lons)) / 2},
        }
    if not handler.elements:
        raise ValueError("Extract contains no facilities; refusing to overwrite the directory")
    # Geofabrik extracts often omit an explicit bounding box in the PBF header.
    # The Eastern Zone includes Bihar, Jharkhand, Odisha, and West Bengal.
    bounds = bounds if hasattr(bounds, "bottom") else None
    result = {
        "source": "OpenStreetMap / Geofabrik regional extract",
        "source_url": args.source_url,
        "license": "https://opendatacommons.org/licenses/odbl/1-0/",
        "attribution": "© OpenStreetMap contributors",
        "snapshot_at": timestamp,
        "bounds": {
            "south": bounds.bottom if bounds else 17.0,
            "west": bounds.left if bounds else 79.0,
            "north": bounds.top if bounds else 29.0,
            "east": bounds.right if bounds else 91.0,
        },
        "elements": list(handler.elements.values()),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(args.output, "wt", encoding="utf-8", compresslevel=9) as stream:
        json.dump(result, stream, ensure_ascii=False, separators=(",", ":"))
    print(f"Saved {len(handler.elements)} facilities dated {timestamp} to {args.output}")


if __name__ == "__main__":
    main()
