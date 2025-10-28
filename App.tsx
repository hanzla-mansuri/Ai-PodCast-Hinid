
import React, { useState } from 'react';
import PodcastGenerator from './components/PodcastGenerator';
import LiveConversation from './components/LiveConversation';
import { BrainCircuitIcon, MicIcon } from './components/icons';

type Tab = 'podcast' | 'live';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('podcast');

  const renderTabContent = () => {
    switch (activeTab) {
      case 'podcast':
        return <PodcastGenerator />;
      case 'live':
        return <LiveConversation />;
      default:
        return null;
    }
  };

  const TabButton: React.FC<{ tabName: Tab; label: string; icon: React.ReactNode }> = ({ tabName, label, icon }) => (
    <button
      onClick={() => setActiveTab(tabName)}
      className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm sm:text-base font-medium transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-base-100 focus:ring-brand-secondary rounded-t-lg ${
        activeTab === tabName
          ? 'bg-base-200 text-brand-light border-b-2 border-brand-secondary'
          : 'text-gray-400 hover:bg-base-300 hover:text-white'
      }`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-base-100 font-sans">
      <div className="container mx-auto p-4 sm:p-6 lg:p-8 max-w-5xl">
        <header className="text-center mb-8">
          <h1 className="text-4xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-brand-secondary to-brand-light">
            AI Content Studio
          </h1>
          <p className="mt-2 text-lg text-gray-300">
            Transform transcripts into podcasts and engage in real-time AI conversations.
          </p>
        </header>

        <main>
          <div className="w-full">
            <div className="flex border-b border-base-300">
              <TabButton tabName="podcast" label="Podcast Generator" icon={<BrainCircuitIcon className="w-5 h-5" />} />
              <TabButton tabName="live" label="Live Conversation" icon={<MicIcon className="w-5 h-5" />} />
            </div>
            <div className="bg-base-200 p-4 sm:p-6 rounded-b-lg shadow-2xl min-h-[60vh]">
              {renderTabContent()}
            </div>
          </div>
        </main>
        
        <footer className="text-center mt-8 text-sm text-gray-500">
            <p>Powered by Google Gemini</p>
        </footer>
      </div>
    </div>
  );
};

export default App;
