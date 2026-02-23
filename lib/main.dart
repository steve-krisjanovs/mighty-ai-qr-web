import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';
import 'screens/home_screen.dart';
import 'services/api_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final prefs = await SharedPreferences.getInstance();
  var deviceId = prefs.getString('device_id');
  if (deviceId == null) {
    deviceId = const Uuid().v4();
    await prefs.setString('device_id', deviceId);
  }

  final api = ApiService(deviceId: deviceId);
  await api.init();

  runApp(MightyAiQrApp(api: api));
}

class MightyAiQrApp extends StatelessWidget {
  final ApiService api;

  const MightyAiQrApp({super.key, required this.api});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Mighty AI QR',
      debugShowCheckedModeBanner: false,
      theme: ThemeData.dark().copyWith(
        colorScheme: const ColorScheme.dark(
          primary: Color(0xFFFF6B35),
          secondary: Color(0xFFFFB347),
          surface: Color(0xFF1A1A2E),
        ),
        scaffoldBackgroundColor: const Color(0xFF0F0F23),
      ),
      home: HomeScreen(apiService: api),
    );
  }
}
