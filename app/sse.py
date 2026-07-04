import json
import queue as q_module
import rq

from app.cache import download_queue


sse_queues = {}


def sse_broadcast(user_id, event, data):
    q_list = sse_queues.get(user_id, [])
    msg = f"event: {event}\ndata: {json.dumps(data)}\n\n"
    for q in q_list:
        try:
            q.put_nowait(msg)
        except q_module.Full:
            pass
