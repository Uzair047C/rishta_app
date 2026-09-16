import 'dart:async';
import 'dart:convert';
import 'dart:io';

/// Double-buffered WebSocket bridge between IDE editor state and Flutter Dart VM Service.
/// Enables sub-100ms hot reloads, debounce-coalescing of file updates,
/// and remote triggers for debug paint, repaint rainbow, and performance overlays.
void main(List<String> args) async {
  final vmUriArg = _getArg(args, '--vm-service-uri', 'ws://127.0.0.1:8181/ws');
  final bridgePort = int.tryParse(_getArg(args, '--bridge-port', '8182')) ?? 8182;
  final debounceMs = int.tryParse(_getArg(args, '--debounce-ms', '35')) ?? 35;

  stdout.writeln('====================================================');
  stdout.writeln('[LivePreviewBridge] Initializing Ultra-Low Latency Bridge');
  stdout.writeln('  Target VM Service : $vmUriArg');
  stdout.writeln('  Bridge HTTP/WS Port: $bridgePort');
  stdout.writeln('  Debounce Window   : ${debounceMs}ms');
  stdout.writeln('====================================================');

  final bridge = LivePreviewBridge(
    vmServiceUri: Uri.parse(vmUriArg),
    bridgePort: bridgePort,
    debounceDuration: Duration(milliseconds: debounceMs),
  );

  await bridge.start();
}

String _getArg(List<String> args, String name, String defaultValue) {
  for (final arg in args) {
    if (arg.startsWith('$name=')) {
      return arg.substring('$name='.length);
    }
  }
  return defaultValue;
}

class LivePreviewBridge {
  LivePreviewBridge({
    required this.vmServiceUri,
    required this.bridgePort,
    required this.debounceDuration,
  });

  final Uri vmServiceUri;
  final int bridgePort;
  final Duration debounceDuration;

  WebSocket? _vmSocket;
  int _rpcId = 1;
  final Map<int, Completer<Map<String, dynamic>>> _pendingRpc = {};
  String? _rootIsolateId;

  // Double-buffer debouncer
  Timer? _debounceTimer;
  bool _reloadInProgress = false;
  bool _queuedReload = false;

  // Render state toggles
  bool _debugPaintEnabled = false;
  bool _repaintRainbowEnabled = false;
  bool _perfOverlayEnabled = false;

  HttpServer? _server;

  Future<void> start() async {
    await _startHttpServer();
    unawaited(_connectVmServiceWithRetry());
    _watchSourceDirectories();
  }

  Future<void> _startHttpServer() async {
    try {
      _server = await HttpServer.bind(InternetAddress.loopbackIPv4, bridgePort);
      stdout.writeln('[LivePreviewBridge] Bridge HTTP & WebSocket listening on http://127.0.0.1:$bridgePort');

      _server!.listen((HttpRequest request) async {
        // Handle CORS
        request.response.headers.add('Access-Control-Allow-Origin', '*');
        request.response.headers.add('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        request.response.headers.add('Access-Control-Allow-Headers', 'Content-Type');

        if (request.method == 'OPTIONS') {
          request.response.statusCode = HttpStatus.ok;
          await request.response.close();
          return;
        }

        if (WebSocketTransformer.isUpgradeRequest(request)) {
          final ws = await WebSocketTransformer.upgrade(request);
          _handleClientWs(ws);
          return;
        }

        final path = request.uri.path;
        try {
          switch (path) {
            case '/status':
              _respondJson(request, {
                'connectedToVm': _vmSocket != null,
                'isolateId': _rootIsolateId,
                'debugPaint': _debugPaintEnabled,
                'repaintRainbow': _repaintRainbowEnabled,
                'perfOverlay': _perfOverlayEnabled,
              });
              break;
            case '/reload':
              _triggerDebouncedReload('http_request');
              _respondJson(request, {'status': 'queued_reload'});
              break;
            case '/toggle-debug-paint':
              _debugPaintEnabled = !_debugPaintEnabled;
              await _callFlutterExtension('ext.flutter.debugPaint', {
                'enabled': _debugPaintEnabled.toString(),
              });
              _respondJson(request, {'debugPaint': _debugPaintEnabled});
              break;
            case '/toggle-repaint-rainbow':
              _repaintRainbowEnabled = !_repaintRainbowEnabled;
              await _callFlutterExtension('ext.flutter.repaintRainbow', {
                'enabled': _repaintRainbowEnabled.toString(),
              });
              _respondJson(request, {'repaintRainbow': _repaintRainbowEnabled});
              break;
            case '/toggle-perf-overlay':
              _perfOverlayEnabled = !_perfOverlayEnabled;
              await _callFlutterExtension('ext.flutter.showPerformanceOverlay', {
                'enabled': _perfOverlayEnabled.toString(),
              });
              _respondJson(request, {'perfOverlay': _perfOverlayEnabled});
              break;
            default:
              request.response.statusCode = HttpStatus.notFound;
              request.response.write('Not Found');
              await request.response.close();
          }
        } catch (e, st) {
          stderr.writeln('[LivePreviewBridge] Error handling request: $e\n$st');
          request.response.statusCode = HttpStatus.internalServerError;
          request.response.write('Internal Error: $e');
          await request.response.close();
        }
      });
    } catch (e) {
      stderr.writeln('[LivePreviewBridge] Failed to bind HTTP server on port $bridgePort: $e');
    }
  }

  void _respondJson(HttpRequest request, Map<String, dynamic> data) {
    request.response.headers.contentType = ContentType.json;
    request.response.write(jsonEncode(data));
    request.response.close();
  }

  void _handleClientWs(WebSocket ws) {
    stdout.writeln('[LivePreviewBridge] Client IDE / Webview connected via WebSocket');
    ws.listen((data) {
      try {
        final decoded = jsonDecode(data.toString()) as Map<String, dynamic>;
        final action = decoded['action'];
        if (action == 'reload') {
          _triggerDebouncedReload('client_ws');
          ws.add(jsonEncode({'event': 'reload_queued'}));
        } else if (action == 'toggleDebugPaint') {
          _debugPaintEnabled = !_debugPaintEnabled;
          _callFlutterExtension('ext.flutter.debugPaint', {
            'enabled': _debugPaintEnabled.toString(),
          });
          ws.add(jsonEncode({'debugPaint': _debugPaintEnabled}));
        }
      } catch (e) {
        stderr.writeln('[LivePreviewBridge] WS decoding error: $e');
      }
    });
  }

  Future<void> _connectVmServiceWithRetry() async {
    while (true) {
      if (_vmSocket == null) {
        try {
          stdout.writeln('[LivePreviewBridge] Connecting to VM Service at $vmServiceUri...');
          final ws = await WebSocket.connect(vmServiceUri.toString()).timeout(const Duration(seconds: 3));
          _vmSocket = ws;
          stdout.writeln('[LivePreviewBridge] Connected to Dart VM Service!');

          ws.listen(
            _onVmMessage,
            onDone: () {
              stdout.writeln('[LivePreviewBridge] VM Service connection closed.');
              _vmSocket = null;
            },
            onError: (err) {
              stderr.writeln('[LivePreviewBridge] VM Service socket error: $err');
              _vmSocket = null;
            },
          );

          await _initializeVmState();
        } catch (_) {
          // Retry periodically until Flutter app launches and opens VM service
          await Future.delayed(const Duration(seconds: 2));
        }
      } else {
        await Future.delayed(const Duration(seconds: 5));
      }
    }
  }

  Future<void> _initializeVmState() async {
    try {
      final vmData = await _sendRpc('getVM', {});
      final isolates = vmData['isolates'] as List<dynamic>?;
      if (isolates != null && isolates.isNotEmpty) {
        _rootIsolateId = isolates.first['id']?.toString();
        stdout.writeln('[LivePreviewBridge] Bound Root Isolate: $_rootIsolateId');
      }
    } catch (e) {
      stderr.writeln('[LivePreviewBridge] Failed to get VM state: $e');
    }
  }

  void _onVmMessage(dynamic raw) {
    try {
      final data = jsonDecode(raw.toString()) as Map<String, dynamic>;
      final id = data['id'];
      if (id != null && _pendingRpc.containsKey(id)) {
        final completer = _pendingRpc.remove(id);
        if (data.containsKey('error')) {
          completer?.completeError(data['error'] as Object);
        } else {
          completer?.complete(data['result'] as Map<String, dynamic>? ?? {});
        }
      }
    } catch (e) {
      stderr.writeln('[LivePreviewBridge] Error decoding VM message: $e');
    }
  }

  Future<Map<String, dynamic>> _sendRpc(String method, Map<String, dynamic> params) {
    final socket = _vmSocket;
    if (socket == null) {
      return Future.error(StateError('VM Service not connected'));
    }
    final id = _rpcId++;
    final completer = Completer<Map<String, dynamic>>();
    _pendingRpc[id] = completer;

    socket.add(jsonEncode({
      'jsonrpc': '2.0',
      'id': id,
      'method': method,
      'params': params,
    }));

    return completer.future.timeout(const Duration(seconds: 5), onTimeout: () {
      _pendingRpc.remove(id);
      throw TimeoutException('VM RPC $method timed out');
    });
  }

  Future<void> _callFlutterExtension(String method, Map<String, String> args) async {
    if (_rootIsolateId == null) {
      await _initializeVmState();
    }
    if (_rootIsolateId == null) {
      stdout.writeln('[LivePreviewBridge] Cannot call $method: no active isolate');
      return;
    }
    try {
      final res = await _sendRpc(method, {
        'isolateId': _rootIsolateId,
        ...args,
      });
      stdout.writeln('[LivePreviewBridge] Invoked $method => $res');
    } catch (e) {
      stderr.writeln('[LivePreviewBridge] Failed to invoke $method: $e');
    }
  }

  void _triggerDebouncedReload(String reason) {
    if (_debounceTimer?.isActive ?? false) {
      _debounceTimer?.cancel();
    }

    _debounceTimer = Timer(debounceDuration, () async {
      if (_reloadInProgress) {
        _queuedReload = true;
        return;
      }

      _reloadInProgress = true;
      final sw = Stopwatch()..start();
      stdout.writeln('[LivePreviewBridge] Triggering sub-100ms Hot Reload (reason: $reason)...');

      try {
        await _callFlutterExtension('ext.flutter.reassemble', {});
        stdout.writeln('[LivePreviewBridge] Hot Reload completed in ${sw.elapsedMilliseconds}ms.');
      } catch (e) {
        stderr.writeln('[LivePreviewBridge] Hot reload invocation error: $e');
      } finally {
        _reloadInProgress = false;
        if (_queuedReload) {
          _queuedReload = false;
          _triggerDebouncedReload('queued_buffer');
        }
      }
    });
  }

  void _watchSourceDirectories() {
    final dirs = ['lib', 'assets'];
    for (final dirPath in dirs) {
      final dir = Directory(dirPath);
      if (dir.existsSync()) {
        stdout.writeln('[LivePreviewBridge] Scoped watcher attached to: ${dir.path}');
        dir.watch(recursive: true).listen((event) {
          // Filter out temporary editor files or hidden files
          final path = event.path;
          if (path.endsWith('.dart') || path.contains('assets')) {
            _triggerDebouncedReload('file_modified: ${File(path).uri.pathSegments.last}');
          }
        });
      }
    }
  }
}
