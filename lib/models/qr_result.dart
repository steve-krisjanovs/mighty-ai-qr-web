class QrResult {
  final String qrString;
  final String imageBase64;
  final String presetName;
  final String deviceName;
  final List<Map<String, dynamic>> settings;

  const QrResult({
    required this.qrString,
    required this.imageBase64,
    required this.presetName,
    required this.deviceName,
    required this.settings,
  });

  factory QrResult.fromJson(Map<String, dynamic> json) => QrResult(
        qrString: json['qrString'] as String? ?? '',
        imageBase64: json['imageBase64'] as String? ?? '',
        presetName: json['presetName'] as String? ?? 'Preset',
        deviceName: json['deviceName'] as String? ?? 'MightyAmp',
        settings: (json['settings'] as List<dynamic>?)
                ?.map((s) => Map<String, dynamic>.from(s as Map))
                .toList() ??
            [],
      );
}
