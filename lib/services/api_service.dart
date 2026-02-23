import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../models/message.dart';
import '../models/qr_result.dart';

class ChatResponse {
  final String message;
  final QrResult? qr;
  final int generationsUsed;
  final int generationsLimit;
  final int freeRemaining;
  final bool hasActiveSubscription;

  const ChatResponse({
    required this.message,
    this.qr,
    required this.generationsUsed,
    required this.generationsLimit,
    required this.freeRemaining,
    required this.hasActiveSubscription,
  });

  factory ChatResponse.fromJson(Map<String, dynamic> json) => ChatResponse(
        message: json['message'] as String? ?? '',
        qr: json['qr'] != null
            ? QrResult.fromJson(json['qr'] as Map<String, dynamic>)
            : null,
        generationsUsed: json['generationsUsed'] as int? ?? 0,
        generationsLimit: json['generationsLimit'] as int? ?? 10,
        freeRemaining: json['freeRemaining'] as int? ?? 10,
        hasActiveSubscription:
            json['hasActiveSubscription'] as bool? ?? false,
      );
}

class FreeLimitException implements Exception {}

class ApiService {
  // nginx proxies /api -> mighty-ai-qr-server:3003
  static const _base = '/api';

  final String deviceId;
  String? _token;

  int generationsUsed = 0;
  int generationsLimit = 10;
  int freeRemaining = 10;
  bool hasActiveSubscription = false;

  ApiService({required this.deviceId});

  Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();
    _token = prefs.getString('auth_token');
    if (_token == null) await _authenticate();
  }

  Future<void> _authenticate() async {
    final res = await http.post(
      Uri.parse('$_base/auth/device'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'deviceId': deviceId}),
    );
    if (res.statusCode != 200) throw Exception('Auth failed: ${res.statusCode}');

    final data = jsonDecode(res.body) as Map<String, dynamic>;
    _token = data['token'] as String;
    _updateUsage(data);

    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('auth_token', _token!);
  }

  void _updateUsage(Map<String, dynamic> data) {
    generationsUsed = data['generationsUsed'] as int? ?? generationsUsed;
    generationsLimit = data['generationsLimit'] as int? ?? generationsLimit;
    freeRemaining = data['freeRemaining'] as int? ?? freeRemaining;
    hasActiveSubscription =
        data['hasActiveSubscription'] as bool? ?? hasActiveSubscription;
  }

  Future<ChatResponse> sendMessage(List<Message> messages) async {
    if (_token == null) await _authenticate();

    final res = await http.post(
      Uri.parse('$_base/chat'),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $_token',
      },
      body: jsonEncode({
        'messages': messages.map((m) => m.toJson()).toList(),
      }),
    );

    if (res.statusCode == 402) throw FreeLimitException();

    if (res.statusCode == 401) {
      _token = null;
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove('auth_token');
      await _authenticate();
      return sendMessage(messages);
    }

    if (res.statusCode != 200) {
      throw Exception('Server error ${res.statusCode}');
    }

    final data = jsonDecode(res.body) as Map<String, dynamic>;
    _updateUsage(data);
    return ChatResponse.fromJson(data);
  }
}
