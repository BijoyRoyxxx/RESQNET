import json
import os
import subprocess
import sys


def test_reports_survive_application_restart_in_a_new_process(tmp_path):
    environment = {
        **os.environ,
        "RESQ_DATABASE_URL": f"sqlite:///{tmp_path / 'restart.db'}",
        "RESQ_AI_MODE": "rules",
    }
    writer = """
import json
from fastapi.testclient import TestClient
from backend.main import app
with TestClient(app) as client:
    session = client.post('/api/auth/register', json={'email':'restart@test.local','password':'Restart passphrase 2026','name':'Restart User'}).json()
    client.headers['X-CSRF-Token'] = session['csrf']
    result = client.post('/api/reports', json={'text':'Synthetic flooding report at a fictional shelter.', 'synthetic':True})
    assert result.status_code == 201
    message = client.post('/api/portal/reports/' + result.json()['id'] + '/messages', json={'body':'Keep this conversation after restart.'})
    assert message.status_code == 201
    print(json.dumps({'id':result.json()['id']}))
"""
    reader = """
import json
from fastapi.testclient import TestClient
from backend.main import app
with TestClient(app) as client:
    session = client.post('/api/auth/login', json={'email':'restart@test.local','password':'Restart passphrase 2026'}).json()
    client.headers['X-CSRF-Token'] = session['csrf']
    cases = client.get('/api/portal/reports').json()
    assert cases[0]['messages'][0]['body'] == 'Keep this conversation after restart.'
    reports = [case['report'] for case in cases]
    assert len(reports) == 1
    assert reports[0]['text'] == 'Synthetic flooding report at a fictional shelter.'
    print(json.dumps({'id':reports[0]['id']}))
"""
    written = subprocess.run(
        [sys.executable, "-c", writer], env=environment, check=True, capture_output=True, text=True
    )
    restored = subprocess.run(
        [sys.executable, "-c", reader], env=environment, check=True, capture_output=True, text=True
    )
    assert json.loads(written.stdout)["id"] == json.loads(restored.stdout)["id"]
