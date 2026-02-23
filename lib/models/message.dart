class Message {
  final String role;
  final String content;

  const Message({required this.role, required this.content});

  Map<String, dynamic> toJson() => {'role': role, 'content': content};
}
