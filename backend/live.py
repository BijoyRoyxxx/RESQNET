"""Small authenticated fan-out used to tell open workspaces that saved data changed."""

import asyncio


class UpdateStream:
    def __init__(self) -> None:
        self._subscribers: set[asyncio.Queue[None]] = set()
        self._lock = asyncio.Lock()

    async def subscribe(self) -> asyncio.Queue[None]:
        subscriber: asyncio.Queue[None] = asyncio.Queue(maxsize=1)
        async with self._lock:
            self._subscribers.add(subscriber)
        return subscriber

    async def unsubscribe(self, subscriber: asyncio.Queue[None]) -> None:
        async with self._lock:
            self._subscribers.discard(subscriber)

    async def publish(self) -> None:
        async with self._lock:
            subscribers = tuple(self._subscribers)
        for subscriber in subscribers:
            if subscriber.full():
                continue
            subscriber.put_nowait(None)


updates = UpdateStream()
