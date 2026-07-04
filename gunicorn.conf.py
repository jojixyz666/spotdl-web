bind = '127.0.0.1:5000'
workers = 4
worker_class = 'gthread'
threads = 4
timeout = 300
keepalive = 65
max_requests = 1000
max_requests_jitter = 50
accesslog = '/var/log/spotdl-gunicorn-access.log'
errorlog = '/var/log/spotdl-gunicorn-error.log'
loglevel = 'warning'

def on_starting(server):
    import sys
    sys.path.insert(0, '/opt/spotdl-web')
    from main import init_db
    init_db()
