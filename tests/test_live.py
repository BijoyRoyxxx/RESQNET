import asyncio

from fastapi import Request

from backend.db import Account
from backend.live import updates
from backend.main import live_updates


def test_live_updates_are_broadcast_once_per_pending_client():
    async def check():
        subscriber = await updates.subscribe()
        try:
            await updates.publish()
            await updates.publish()
            await asyncio.wait_for(subscriber.get(), timeout=0.1)
            assert subscriber.empty()
        finally:
            await updates.unsubscribe(subscriber)

    asyncio.run(check())


def test_live_endpoint_sends_ready_then_update_event():
    async def check():
        async def receive():
            return {"type": "http.request", "body": b"", "more_body": False}

        request = Request(
            {"type": "http", "method": "GET", "path": "/api/live", "headers": []},
            receive,
        )
        response = await live_updates(
            request, Account(name="Admin", email="admin@test.local", password_hash="x")
        )
        stream = response.body_iterator
        assert "event: ready" in await anext(stream)
        next_event = asyncio.create_task(anext(stream))
        await asyncio.sleep(0)
        await updates.publish()
        assert "event: update" in await asyncio.wait_for(next_event, timeout=0.1)
        await stream.aclose()

    asyncio.run(check())
