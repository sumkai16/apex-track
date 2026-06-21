// app/auth/callback.tsx
import { ActivityIndicator, View } from 'react-native';

export default function AuthCallback() {
    return (
        <View style={{ flex: 1, backgroundColor: '#050505', justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator color="#800000" />
        </View>
    );
}