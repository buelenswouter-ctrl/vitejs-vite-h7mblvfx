import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot, deleteDoc, query, where, getDocs } from 'firebase/firestore';
import { 
  BookOpen, Upload, Tag, Search, ChevronRight, Layers, Highlighter, 
  FileText, X, Plus, Sparkles, Wand2, FileSearch, Loader2, MessageSquare, 
  Send, Lightbulb, GraduationCap, Copy, Image as ImageIcon, Activity, 
  CheckCircle, LifeBuoy, Calendar, Shuffle, Edit, MessageCircle, Brain, UserSearch, AlignLeft, Trash2
} from 'lucide-react';

const apiKey = "AIzaSyCmWnLM86w8OytutNEFiab5t3W0Mdl90uc";

const firebaseConfig = {
  apiKey: "AIzaSyCKyyha9T3bux16l8bGebTsoN7har6ztDE",
  authDomain: "wijze-lessen-researcher.firebaseapp.com",
  projectId: "wijze-lessen-researcher",
  storageBucket: "wijze-lessen-researcher.firebasestorage.app",
  messagingSenderId: "233907100124",
  appId: "1:233907100124:web:ec621d4f35faee05b59719",
  measurementId: "G-8KN100WKKF"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = "wijze-lessen-researcher"; // Gebruik hier je Project ID

// De 12 bouwstenen met iconen
const BOUWSTENEN = [
  { id: 1, title: "Activeer relevante voorkennis", icon: Lightbulb, description: "Verbind nieuwe informatie met wat leerlingen al weten." },
  { id: 2, title: "Geef heldere uitleg", icon: MessageSquare, description: "Duidelijke instructie en voorbeelden (scaffolding)." },
  { id: 3, title: "Werk met voorbeelden", icon: Copy, description: "Gebruik uitgewerkte voorbeelden om cognitieve belasting te verlagen." },
  { id: 4, title: "Combineer woord en beeld", icon: ImageIcon, description: "Duale codering om het werkgeheugen te ontlasten." },
  { id: 5, title: "Laat leerlingen leerstof actief verwerken", icon: Activity, description: "Oefenen met de leerstof om retentie te verhogen." },
  { id: 6, title: "Evalueer of de leerstof begrepen is", icon: CheckCircle, description: "Formatief handelen en checken van begrip." },
  { id: 7, title: "Ondersteun bij moeilijke taken", icon: LifeBuoy, description: "Geleidelijke afbouw van ondersteuning." },
  { id: 8, title: "Spreid oefening in de tijd", icon: Calendar, description: "Spaced practice voor betere onthouding." },
  { id: 9, title: "Wissel oefenvormen af", icon: Shuffle, description: "Interleaving van verschillende type opdrachten." },
  { id: 10, title: "Gebruik toetsing als leerstrategie", icon: Edit, description: "Retrieval practice om kennis te verankeren." },
  { id: 11, title: "Geef feedback die aanzet tot denken", icon: MessageCircle, description: "Effectieve feedbackloops gericht op het leerproces." },
  { id: 12, title: "Leer leerlingen effectief leren", icon: Brain, description: "Metacognitieve strategieën en zelfregulatie." }
];

// Generieke Gemini API functie
const callGemini = async (prompt, systemPrompt = "", isJson = false) => {
  const maxRetries = 5;
  let delay = 1000;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const body = {
        contents: [{ parts: [{ text: prompt }] }],
        systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined
      };
      
      if (isJson) {
        body.generationConfig = { responseMimeType: "application/json" };
      }

      // Modelnaam aangepast naar stabiele gemini-1.5-flash
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!response.ok) throw new Error('API request failed');
      const result = await response.json();
      return result.candidates?.[0]?.content?.parts?.[0]?.text || "";
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
};

/* --- COMPONENT: CHAT PANEEL --- */
const ChatPanel = ({ selectedDoc }) => {
  const [chatHistory, setChatHistory] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatRole, setChatRole] = useState("coach"); 
  const [isChatting, setIsChatting] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory, isChatting]);

  const switchRole = (role) => {
    setChatRole(role);
    setChatHistory([]); // Wis chatgeschiedenis bij rolwissel
  };

  const handleChat = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || !selectedDoc) return;

    const userMessage = chatInput;
    setChatInput("");
    setChatHistory(prev => [...prev, { role: 'user', text: userMessage }]);
    setIsChatting(true);

    const context = `Document titel: ${selectedDoc.title}\nInhoud: ${selectedDoc.content.substring(0, 8000)}`;
    const prompt = `Context:\n${context}\n\nVraag: ${userMessage}`;
    
    let systemPrompt = "";
    if (chatRole === "coach") {
      systemPrompt = "Je bent een didactisch coach gebaseerd op de 'Wijze Lessen' van Thomas More. Beantwoord vragen over hoe de tekst vertaald kan worden naar de lespraktijk. Wees praktisch, bemoedigend en link naar de 12 bouwstenen. Antwoord in het Nederlands.";
    } else {
      systemPrompt = "Je bent een uiterst strikte en kritische onderwijsonderzoeker. Beantwoord de vraag UITSLUITEND en ALLEEN op basis van de letterlijke tekst die in de context is meegeleverd. Verzin GEEN informatie en gebruik GEEN externe kennis. Als het antwoord niet in de tekst te vinden is, zeg dan expliciet: 'Deze informatie wordt niet in de geselecteerde tekst vermeld.'";
    }

    try {
      const response = await callGemini(prompt, systemPrompt);
      setChatHistory(prev => [...prev, { role: 'ai', text: response }]);
    } catch (error) {
      setChatHistory(prev => [...prev, { role: 'ai', text: "Er is een fout opgetreden bij het genereren van het antwoord." }]);
    } finally {
      setIsChatting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <div className="flex p-3 bg-slate-50 gap-2 border-b border-slate-100">
        <button 
          onClick={() => switchRole('coach')}
          className={`flex-1 py-2 text-[10px] font-black uppercase tracking-wider rounded-lg flex items-center justify-center gap-1.5 transition-all duration-300 ${chatRole === 'coach' ? 'bg-[#F37021] text-white shadow-md transform scale-[1.02]' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-100'}`}
        >
          <Lightbulb size={14} /> Didactische Coach
        </button>
        <button 
          onClick={() => switchRole('researcher')}
          className={`flex-1 py-2 text-[10px] font-black uppercase tracking-wider rounded-lg flex items-center justify-center gap-1.5 transition-all duration-300 ${chatRole === 'researcher' ? 'bg-[#003B5C] text-white shadow-md transform scale-[1.02]' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-100'}`}
        >
          <UserSearch size={14} /> Onderzoeker
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-slate-50/50 custom-scrollbar">
        {chatHistory.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-4 animate-in fade-in zoom-in duration-300">
            <div className={`p-4 rounded-full mb-3 shadow-inner ${chatRole === 'coach' ? 'bg-[#F37021]/10 text-[#F37021]' : 'bg-[#003B5C]/10 text-[#003B5C]'}`}>
              {chatRole === 'coach' ? <Lightbulb size={32} /> : <UserSearch size={32} />}
            </div>
            <p className="text-xs font-bold text-slate-700 mb-1">
              {chatRole === 'coach' ? 'Coach Modus Actief' : 'Onderzoeker Modus Actief'}
            </p>
            <p className="text-xs font-medium text-slate-500 max-w-[200px]">
              {chatRole === 'coach' 
                ? "Ik help je deze theorie te vertalen naar je eigen lespraktijk." 
                : "Ik beantwoord vragen strikt en alleen op basis van de tekst hiernaast."}
            </p>
          </div>
        ) : (
          chatHistory.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] p-3.5 rounded-2xl text-xs leading-relaxed ${
                msg.role === 'user' 
                  ? 'bg-[#003B5C] text-white rounded-tr-none shadow-md' 
                  : `bg-white border border-slate-200 text-slate-800 rounded-tl-none shadow-sm ${chatRole === 'researcher' ? 'border-l-4 border-l-[#003B5C]' : 'border-l-4 border-l-[#F37021]'}`
              }`}>
                {msg.text}
              </div>
            </div>
          ))
        )}
        {isChatting && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-200 p-3.5 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-2">
              <Loader2 size={14} className="animate-spin text-[#F37021]" /> <span className="text-xs text-slate-400">Denkt na...</span>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <div className="p-4 bg-white border-t border-slate-100">
        <form onSubmit={handleChat} className="relative">
          <input 
            type="text" 
            placeholder={chatRole === 'coach' ? "Vraag advies voor je les..." : "Vraag over de studie..."}
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            className="w-full pl-4 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-[#F37021] outline-none transition font-medium"
          />
          <button 
            type="submit"
            disabled={!chatInput.trim() || isChatting}
            className={`absolute right-2 top-1/2 -translate-y-1/2 p-2 text-white rounded-lg transition disabled:opacity-50 shadow-sm ${chatRole === 'coach' ? 'bg-[#F37021] hover:bg-[#d9611a]' : 'bg-[#003B5C] hover:bg-[#002b44]'}`}
          >
            <Send size={14} />
          </button>
        </form>
      </div>
    </div>
  );
};

/* --- COMPONENT: ANNOTATIE PANEEL --- */
const AnnotationPanel = ({ user, selectedDoc, pendingSelection, setPendingSelection, highlights, onHighlightClick, activeHighlightId }) => {
  const [newTagInput, setNewTagInput] = useState("");
  const [newCommentInput, setNewCommentInput] = useState("");
  const [isSuggestingTag, setIsSuggestingTag] = useState(false);

  // Verzamel unieke tags voor de suggestielijst
  const uniqueTags = useMemo(() => {
    const tags = new Set();
    highlights.forEach(h => {
      if (h.tag) tags.add(h.tag.toLowerCase().trim());
    });
    return Array.from(tags).filter(Boolean);
  }, [highlights]);

  const suggestTag = async () => {
    if (!pendingSelection) return;
    setIsSuggestingTag(true);
    try {
      const prompt = `Welke tag (maximaal 2 woorden) past het beste bij dit stuk tekst in de context van onderwijs?\nTekst: "${pendingSelection.text}"`;
      const tag = await callGemini(prompt, "Geef alleen de tag terug in kleine letters.");
      setNewTagInput(tag.trim().toLowerCase());
    } catch (error) {
      console.error(error);
    } finally {
      setIsSuggestingTag(false);
    }
  };

  const saveAnnotation = async () => {
    if (!user || !selectedDoc || !pendingSelection) return;
    
    const hId = crypto.randomUUID();
    await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'highlights', hId), {
      docId: selectedDoc.id,
      docTitle: selectedDoc.title,
      text: pendingSelection.text,
      occurrenceIndex: pendingSelection.occurrenceIndex, // Voeg de index toe voor exacte selectie
      tag: newTagInput || "algemeen",
      comment: newCommentInput || "",
      timestamp: Date.now()
    });

    setPendingSelection(null);
    setNewTagInput("");
    setNewCommentInput("");
    window.getSelection().removeAllRanges();
  };

  const deleteAnnotation = async (id, e) => {
    e.stopPropagation(); // Voorkom dat er tegelijkertijd op de highlight wordt geklikt
    if (!user) return;
    await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'highlights', id));
  };

  const docHighlights = highlights.filter(h => h.docId === selectedDoc?.id);

  return (
    <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden">
      <div className="p-5 overflow-y-auto custom-scrollbar flex-1">
        {pendingSelection ? (
          <div className="bg-white p-4 rounded-xl border-2 border-[#F37021]/20 shadow-sm mb-6 animate-in fade-in slide-in-from-top-2">
            <h4 className="text-[11px] font-black text-[#F37021] uppercase tracking-[0.1em] mb-3">Nieuwe Annotatie</h4>
            <p className="text-xs italic text-slate-600 mb-3 border-l-2 border-[#F37021] pl-2 line-clamp-4">"{pendingSelection.text}"</p>
            
            <div className="space-y-3">
              <div className="flex gap-2 relative">
                <input 
                  type="text" 
                  list="tag-suggestions"
                  placeholder="Tag (bijv. retrieval)"
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  className="flex-1 text-xs border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[#F37021]"
                />
                {/* Datalist met eerdere tags voor autocomplete suggesties */}
                <datalist id="tag-suggestions">
                  {uniqueTags.map((tag, idx) => (
                    <option key={idx} value={tag} />
                  ))}
                </datalist>

                <button 
                  onClick={suggestTag}
                  title="AI suggereert tag"
                  className="bg-slate-100 text-[#003B5C] p-2 rounded-lg hover:bg-slate-200 transition shrink-0"
                >
                  {isSuggestingTag ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                </button>
              </div>
              
              <textarea 
                placeholder="Jouw opmerking of gedachte hierbij..."
                value={newCommentInput}
                onChange={(e) => setNewCommentInput(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[#F37021] resize-none h-20"
              />
              
              <div className="flex gap-2">
                <button onClick={() => setPendingSelection(null)} className="flex-1 text-xs font-bold text-slate-500 hover:text-slate-800 py-2">Annuleren</button>
                <button onClick={saveAnnotation} className="flex-1 bg-[#F37021] text-white text-xs font-bold py-2 rounded-lg hover:bg-[#d9611a] transition shadow-md">Opslaan</button>
              </div>
            </div>
          </div>
        ) : (
           <div className="text-xs text-slate-400 italic text-center p-4 border-2 border-dashed border-slate-200 rounded-xl mb-6">
             Selecteer tekst in het document om een notitie of tag toe te voegen.
           </div>
        )}

        {/* Opgeslagen Annotaties Lijst */}
        <div className="space-y-3">
          {docHighlights.length > 0 && <h4 className="text-[11px] font-black text-[#003B5C] uppercase tracking-[0.1em] mb-2">Jouw Annotaties</h4>}
          {docHighlights.map(h => (
            <div 
              key={h.id} 
              onClick={() => onHighlightClick(h.id)}
              className={`bg-white border p-4 rounded-xl text-xs relative group shadow-sm transition-all cursor-pointer ${activeHighlightId === h.id ? 'border-[#F37021] shadow-md ring-1 ring-[#F37021]' : 'border-slate-200 hover:border-[#F37021]/40'}`}
            >
              <button 
                onClick={(e) => deleteAnnotation(h.id, e)} 
                className="absolute top-3 right-3 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"
              >
                <X size={14}/>
              </button>
              <span className="bg-[#003B5C]/10 text-[#003B5C] font-bold px-2 py-0.5 rounded text-[10px] uppercase">{h.tag}</span>
              <p className="italic text-slate-600 mt-2 mb-2 line-clamp-3">"{h.text}"</p>
              {h.comment && <p className="font-medium text-[#003B5C] border-t border-slate-100 pt-2 mt-2">👤 {h.comment}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};


/* --- HOOFD APPLICATIE --- */
export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('library'); 
  const [documents, setDocuments] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [highlights, setHighlights] = useState([]);
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteTitle, setPasteTitle] = useState("");
  const [pasteContent, setPasteContent] = useState("");

  const [searchTag, setSearchTag] = useState("");
  const [activeSummary, setActiveSummary] = useState(null);
  const [activeSynthesis, setActiveSynthesis] = useState(null);
  
  // Aangepast naar object state om zowel tekst als index bij te houden
  const [pendingSelection, setPendingSelection] = useState(null);
  
  const [rightPanelTab, setRightPanelTab] = useState('annotations'); 
  const [activeHighlightId, setActiveHighlightId] = useState(null);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js';
    script.async = true;
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
    };
    document.body.appendChild(script);
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (e) {
        console.error("Auth error", e);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    
    const docsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'documents');
    const unsubDocs = onSnapshot(docsRef, (snap) => {
      const d = [];
      snap.forEach(doc => d.push({ id: doc.id, ...doc.data() }));
      setDocuments(d);
      if (selectedDoc) {
        const updated = d.find(doc => doc.id === selectedDoc.id);
        if (updated) setSelectedDoc(updated);
      }
    }, console.error);

    const highlightsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'highlights');
    const unsubHighlights = onSnapshot(highlightsRef, (snap) => {
      const h = [];
      snap.forEach(doc => h.push({ id: doc.id, ...doc.data() }));
      setHighlights(h);
    }, console.error);

    return () => { unsubDocs(); unsubHighlights(); };
  }, [user]);

  const classifyDocument = async (title, content) => {
    setIsAnalyzing(true);
    const systemPrompt = `Je bent een STRENGE expert in de didactiek van "Wijze Lessen". Bepaal bij welke van de 12 bouwstenen deze tekst past.
    BELANGRIJKE REGEL: Selecteer in principe slechts ÉÉN hoofd-bouwsteen. Voeg ALLEEN een tweede of derde bouwsteen toe als de tekst daar EXPLICIET en UITGEBREID op ingaat. Forceer geen extra categorieën.
    Lijst:\n${BOUWSTENEN.map(b => `${b.id}: ${b.title}`).join('\n')}
    Geef ALS ANTWOORD UITSLUITEND een valide JSON array met enkel de nummers (integers) van de relevante bouwstenen. Voorbeeld: [3, 10]. Geef geen andere tekst.`;
    
    const prompt = `Titel: ${title}\nInhoud: ${content.substring(0, 3000)}`;

    try {
      const text = await callGemini(prompt, systemPrompt, true);
      const categoryIds = JSON.parse(text);
      return Array.isArray(categoryIds) && categoryIds.length > 0 ? categoryIds : [1];
    } catch (error) {
      console.error("Classificatie fout", error);
      return [1];
    } finally {
      setIsAnalyzing(false);
    }
  };

  const saveDocument = async (title, content) => {
    if (!user) return;
    const categoryIds = await classifyDocument(title, content);
    const docId = crypto.randomUUID();
    
    await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'documents', docId), {
      title,
      content,
      categoryIds,
      date: new Date().toLocaleDateString()
    });
    
    setShowPasteModal(false);
    setPasteTitle("");
    setPasteContent("");
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.type === 'application/pdf') {
      if (!window.pdfjsLib) {
        alert("De PDF-lezer is nog aan het laden, probeer het zo nog eens.");
        return;
      }
      setIsAnalyzing(true);
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await window.pdfjsLib.getDocument(arrayBuffer).promise;
        let fullText = "";
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          fullText += textContent.items.map(item => item.str).join(' ') + "\n\n";
        }
        await saveDocument(file.name, fullText);
      } catch (error) {
        console.error("Fout bij uitlezen PDF:", error);
        alert("Er is een fout opgetreden bij het lezen van de PDF.");
        setIsAnalyzing(false);
      }
    } else {
      const reader = new FileReader();
      reader.onload = async (event) => {
        await saveDocument(file.name, event.target.result);
      };
      reader.readAsText(file);
    }
  };

  const handleDeleteDoc = async (docId, e) => {
    e.stopPropagation();
    if (window.confirm("Weet je zeker dat je dit document wilt verwijderen? Annotaties gaan ook verloren.")) {
      if (!user) return;
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'documents', docId));
    }
  };

  const generateSummary = async () => {
    if (!selectedDoc) return;
    setIsSummarizing(true);
    const prompt = `Schrijf een ZEER UITGEBREIDE en gedetailleerde samenvatting van de volgende tekst. Focus op de wetenschappelijke basis, de methodologie, en de praktische didactische implicaties. Gebruik duidelijke alinea's en tussenkopjes.\n\nTekst: ${selectedDoc.content.substring(0, 10000)}`;
    try {
      const summary = await callGemini(prompt, "Je bent een academische samenvatter in het Nederlands.");
      setActiveSummary(summary);
    } catch (error) {
      console.error(error);
    } finally {
      setIsSummarizing(false);
    }
  };

  const synthesizeHighlights = async () => {
    if (filteredHighlights.length < 2) return;
    setIsSynthesizing(true);
    const prompt = `Synthetiseer de volgende fragmenten die door een docent zijn getagd met "${searchTag}". Maak er een samenhangend betoog of overzicht van.\nFragmenten:\n${filteredHighlights.map(h => `- ${h.text} (Opmerking docent: ${h.comment || 'geen'})`).join('\n')}`;
    try {
      const synthesis = await callGemini(prompt, "Schrijf een academische synthese in het Nederlands.");
      setActiveSynthesis(synthesis);
    } catch (error) {
      console.error(error);
    } finally {
      setIsSynthesizing(false);
    }
  };

  // Functie voor slimme, exacte tekstselectie
  const handleTextSelection = useCallback(() => {
    const selection = window.getSelection();
    if (selection.rangeCount === 0) return;
    const text = selection.toString().trim();
    
    if (text.length > 5 && (!pendingSelection || text !== pendingSelection.text)) {
      const range = selection.getRangeAt(0);
      const container = document.getElementById('document-text-container');
      
      if (!container || !container.contains(range.commonAncestorContainer)) return;

      // Bereken de exacte locatie/index van de selectie zodat we alléén deze markeren
      const preSelectionRange = range.cloneRange();
      preSelectionRange.selectNodeContents(container);
      preSelectionRange.setEnd(range.startContainer, range.startOffset);
      const preText = preSelectionRange.toString();

      let occurrenceIndex = 0;
      let pos = preText.indexOf(text);
      while (pos !== -1) {
        occurrenceIndex++;
        pos = preText.indexOf(text, pos + text.length);
      }

      setPendingSelection({ text, occurrenceIndex });
      setRightPanelTab('annotations');
    }
  }, [pendingSelection]);

  useEffect(() => {
    if (activeHighlightId) {
      const el = document.getElementById(`highlight-${activeHighlightId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [activeHighlightId]);

  const filteredHighlights = useMemo(() => {
    if (!searchTag) return highlights;
    return highlights.filter(h => h.tag.toLowerCase().includes(searchTag.toLowerCase()));
  }, [highlights, searchTag]);

  // Aangepaste render-functie die index/locatie gebruikt voor exacte markering
  const renderHighlightedText = (text, docHighlights, activeId) => {
    if (!text) return null;
    if (!docHighlights || docHighlights.length === 0) return text;

    const highlightsWithPositions = docHighlights.map(h => {
      const searchStr = h.text;
      if (!searchStr) return null;
      let pos = -1;
      let occ = h.occurrenceIndex || 0;
      let currentOcc = 0;
      let searchPos = text.indexOf(searchStr);

      while (searchPos !== -1) {
        if (currentOcc === occ) {
          pos = searchPos;
          break;
        }
        currentOcc++;
        searchPos = text.indexOf(searchStr, searchPos + searchStr.length);
      }

      // Fallback als de exacte index niet klopt
      if (pos === -1) pos = text.indexOf(searchStr);

      return pos !== -1 ? { ...h, startIndex: pos, endIndex: pos + searchStr.length } : null;
    }).filter(h => h !== null).sort((a, b) => a.startIndex - b.startIndex);

    let lastIndex = 0;
    const parts = [];

    highlightsWithPositions.forEach(h => {
      if (h.startIndex >= lastIndex) {
        parts.push({ text: text.substring(lastIndex, h.startIndex), isHighlight: false });
        parts.push({ text: text.substring(h.startIndex, h.endIndex), isHighlight: true, id: h.id, tag: h.tag });
        lastIndex = h.endIndex;
      }
    });
    
    if (lastIndex < text.length) {
      parts.push({ text: text.substring(lastIndex), isHighlight: false });
    }

    return parts.map((part, i) => 
      part.isHighlight ? (
        <mark 
          key={i} 
          id={`highlight-${part.id}`}
          onClick={() => { setActiveHighlightId(part.id); setRightPanelTab('annotations'); }}
          className={`px-1 rounded cursor-pointer transition-all duration-300 ${activeId === part.id ? 'bg-yellow-400 shadow-md ring-2 ring-[#F37021] text-slate-900 font-medium' : 'bg-yellow-200/60 hover:bg-yellow-300 text-inherit'}`}
          title={`Tag: ${part.tag}`}
        >
          {part.text}
        </mark>
      ) : (
        <span key={i}>{part.text}</span>
      )
    );
  };

  const isReaderView = view === 'reader';

  const LibraryView = () => (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-10">
        <div>
          <h2 className="text-3xl font-black text-[#003B5C]">Overzicht bouwstenen</h2>
          <p className="text-slate-500 mt-1">Geordend volgens de 12 bouwstenen van Wijze Lessen</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setShowPasteModal(true)} className="flex items-center gap-2 bg-white text-[#003B5C] border-2 border-[#003B5C] px-5 py-2.5 rounded-lg font-bold hover:bg-slate-50 transition">
            <AlignLeft size={18} /> Tekst Plakken
          </button>
          <label className="flex items-center gap-2 bg-[#F37021] text-white px-5 py-2.5 rounded-lg cursor-pointer hover:bg-[#d9611a] transition shadow-md font-bold">
            <Upload size={18} />
            <span>Bestand Uploaden</span>
            <input type="file" className="hidden" accept=".pdf,.txt,.md,.csv" onChange={handleFileUpload} />
          </label>
        </div>
      </div>

      {isAnalyzing && (
        <div className="mb-8 p-4 bg-[#F37021]/10 border border-[#F37021]/30 rounded-xl flex items-center gap-3 animate-pulse">
          <Loader2 className="text-[#F37021] animate-spin" size={20} />
          <span className="text-[#003B5C] font-semibold">Bestand wordt geanalyseerd en strak geclassificeerd...</span>
        </div>
      )}

      {showPasteModal && (
        <div className="fixed inset-0 bg-[#003B5C]/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6">
            <h3 className="text-xl font-bold text-[#003B5C] mb-4">Nieuwe Tekst Toevoegen</h3>
            <input 
              type="text" 
              placeholder="Titel van de tekst..." 
              value={pasteTitle}
              onChange={e => setPasteTitle(e.target.value)}
              className="w-full mb-4 p-3 border border-slate-200 rounded-lg outline-none focus:border-[#F37021]"
            />
            <textarea 
              placeholder="Plak hier je tekst (bijv. artikel, onderzoek, lesnotities)..."
              value={pasteContent}
              onChange={e => setPasteContent(e.target.value)}
              className="w-full h-64 p-3 border border-slate-200 rounded-lg outline-none focus:border-[#F37021] resize-none mb-4 custom-scrollbar"
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowPasteModal(false)} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-100 rounded-lg">Annuleren</button>
              <button 
                onClick={() => saveDocument(pasteTitle || "Naamloos Document", pasteContent)}
                disabled={!pasteContent.trim()}
                className="px-4 py-2 bg-[#F37021] text-white font-bold rounded-lg hover:bg-[#d9611a] disabled:opacity-50"
              >
                Opslaan & Analyseren
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {BOUWSTENEN.map(bouwsteen => {
          const docs = documents.filter(d => d.categoryIds && d.categoryIds.includes(bouwsteen.id));
          const Icon = bouwsteen.icon;
          
          return (
            <div key={bouwsteen.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col hover:border-[#F37021] hover:shadow-md transition-all group">
              <div className="flex justify-between items-start mb-4">
                <div className="bg-[#003B5C]/5 p-2 rounded-lg text-[#003B5C] group-hover:bg-[#F37021]/10 group-hover:text-[#F37021] transition">
                  <Icon size={20} strokeWidth={2.5} />
                </div>
                <span className="bg-slate-100 text-slate-500 text-[10px] font-black px-2 py-1 rounded uppercase tracking-wider">B{bouwsteen.id}</span>
              </div>
              <h3 className="font-bold text-[#003B5C] mb-2 leading-tight text-sm">{bouwsteen.title}</h3>
              <p className="text-slate-500 text-[11px] mb-4 flex-1 line-clamp-2">{bouwsteen.description}</p>
              
              <div className="space-y-2 border-t border-slate-100 pt-3 mt-auto">
                {docs.length > 0 ? docs.map(doc => (
                  <div key={doc.id} className="group/item relative flex items-center">
                    <button 
                      onClick={() => { setSelectedDoc(doc); setView('reader'); setActiveSummary(null); setPendingSelection(null); setActiveHighlightId(null); }}
                      className="w-full flex items-center gap-2 p-2 hover:bg-slate-50 rounded-lg text-left text-xs text-slate-700 transition pr-8"
                    >
                      <FileText size={14} className="text-[#F37021] shrink-0" />
                      <span className="truncate font-semibold">{doc.title}</span>
                    </button>
                    <button 
                      onClick={(e) => handleDeleteDoc(doc.id, e)}
                      className="absolute right-2 opacity-0 group-hover/item:opacity-100 text-slate-300 hover:text-red-500 transition-opacity p-1 bg-white"
                      title="Verwijder dit document"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )) : (
                  <span className="text-[10px] text-slate-400 italic block py-1">Geen gekoppelde teksten</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const ReaderView = () => (
    <div className="flex h-full bg-slate-50 overflow-hidden">
      <div className="flex-1 flex flex-col border-r border-slate-200 overflow-hidden bg-white relative">
        <div className="bg-white border-b border-slate-100 p-4 flex justify-between items-center z-10 px-6 shadow-sm">
          <button onClick={() => setView('library')} className="text-[#003B5C] hover:text-[#F37021] flex items-center gap-1 font-bold text-sm transition">
            <ChevronRight className="rotate-180" size={18} />
            Terug naar overzicht
          </button>
          
          <div className="flex items-center gap-3">
            <span className="font-black text-[#003B5C] text-sm hidden md:block mr-2 uppercase tracking-widest">Leesweergave</span>
            <button 
              onClick={generateSummary}
              disabled={isSummarizing}
              className="flex items-center gap-2 bg-[#003B5C] text-white px-5 py-2 rounded-lg text-xs font-bold hover:bg-[#002b44] disabled:opacity-50 transition"
            >
              {isSummarizing ? <Loader2 className="animate-spin" size={14} /> : <AlignLeft size={14} />}
              Uitgebreide Samenvatting
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8 lg:p-12 relative custom-scrollbar">
          <div className="max-w-4xl mx-auto">
            {activeSummary && (
              <div className="mb-10 p-8 bg-[#003B5C]/5 border-l-4 border-[#F37021] rounded-r-xl relative animate-in fade-in slide-in-from-top-4">
                <button onClick={() => setActiveSummary(null)} className="absolute top-4 right-4 text-slate-400 hover:text-[#003B5C] transition">
                  <X size={20} />
                </button>
                <h4 className="font-black text-[#003B5C] flex items-center gap-2 mb-4 uppercase tracking-wider">
                  <Sparkles size={18} className="text-[#F37021]" /> AI Samenvatting & Analyse
                </h4>
                <div className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap font-serif prose prose-slate max-w-none">{activeSummary}</div>
              </div>
            )}
            
            <div className="mb-12">
               <div className="flex flex-wrap gap-2 mb-4">
                 {selectedDoc?.categoryIds?.map(id => (
                   <span key={id} className="text-[10px] bg-[#003B5C] text-white px-3 py-1 rounded uppercase font-bold tracking-widest shadow-sm">
                    Bouwsteen {id}
                  </span>
                 ))}
               </div>
              <h1 className="text-4xl font-black text-[#003B5C] leading-tight mb-2">{selectedDoc?.title}</h1>
              <p className="text-slate-400 text-xs font-bold">Toegevoegd op {selectedDoc?.date}</p>
            </div>

            <div className="bg-[#F37021]/10 text-[#F37021] text-xs font-bold p-3 rounded-lg mb-8 inline-flex items-center gap-2">
              <Highlighter size={14} /> Selecteer tekst in het document om te annoteren. Gemarkeerde tekst wordt geel.
            </div>

            <div 
              id="document-text-container"
              onMouseUp={handleTextSelection}
              className="prose prose-slate max-w-none text-lg leading-loose text-slate-800 font-serif whitespace-pre-wrap selection:bg-[#F37021]/30 pb-32"
            >
              {renderHighlightedText(
                selectedDoc?.content, 
                highlights.filter(h => h.docId === selectedDoc?.id),
                activeHighlightId
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="w-[420px] flex flex-col bg-white overflow-hidden shadow-[-10px_0_20px_rgba(0,0,0,0.02)] border-l border-slate-200">
        <div className="flex border-b border-slate-200 bg-slate-50 shrink-0">
          <button 
            onClick={() => setRightPanelTab('annotations')}
            className={`flex-1 py-4 text-[11px] font-black uppercase tracking-[0.1em] flex justify-center items-center gap-2 transition-all ${rightPanelTab === 'annotations' ? 'bg-white text-[#F37021] border-b-2 border-b-[#F37021]' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            <Highlighter size={16} /> Annotaties
          </button>
          <button 
            onClick={() => setRightPanelTab('chat')}
            className={`flex-1 py-4 text-[11px] font-black uppercase tracking-[0.1em] flex justify-center items-center gap-2 transition-all ${rightPanelTab === 'chat' ? 'bg-white text-[#003B5C] border-b-2 border-b-[#003B5C]' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            <MessageSquare size={16} /> AI Assistent
          </button>
        </div>

        {rightPanelTab === 'annotations' ? (
          <AnnotationPanel 
            user={user}
            selectedDoc={selectedDoc}
            pendingSelection={pendingSelection}
            setPendingSelection={setPendingSelection}
            highlights={highlights}
            activeHighlightId={activeHighlightId}
            onHighlightClick={setActiveHighlightId}
          />
        ) : (
          <ChatPanel selectedDoc={selectedDoc} />
        )}
      </div>
    </div>
  );

  const TagExplorerView = () => (
    <div className="p-8 lg:p-12 max-w-7xl mx-auto h-full overflow-y-auto custom-scrollbar">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-6">
        <div>
          <h2 className="text-3xl font-black text-[#003B5C]">Thematische Synthese</h2>
          <p className="text-slate-500 mt-2">Koppel je annotaties en ontdek dwarsverbanden tussen documenten.</p>
        </div>
        <div className="flex gap-3 w-full md:w-auto">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Zoek een tag..."
              value={searchTag}
              onChange={(e) => setSearchTag(e.target.value)}
              className="pl-12 pr-4 py-3 bg-white border-2 border-slate-200 rounded-xl outline-none focus:border-[#F37021] w-full md:w-72 shadow-sm font-bold text-sm text-[#003B5C]"
            />
          </div>
          {searchTag && filteredHighlights.length > 1 && (
            <button 
              onClick={synthesizeHighlights}
              disabled={isSynthesizing}
              className="bg-[#003B5C] text-white px-6 py-3 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-[#002b44] transition-all shadow-md disabled:opacity-50"
            >
              {isSynthesizing ? <Loader2 className="animate-spin" size={18} /> : <FileSearch size={18} />}
              Synthetiseer
            </button>
          )}
        </div>
      </div>

      {activeSynthesis && (
        <div className="mb-12 p-10 bg-[#003B5C] text-white rounded-2xl shadow-xl relative overflow-hidden animate-in zoom-in-95 duration-300">
          <button onClick={() => setActiveSynthesis(null)} className="absolute top-6 right-6 text-slate-400 hover:text-white transition">
            <X size={24} />
          </button>
          <div className="flex items-center gap-3 mb-6">
            <Sparkles size={28} className="text-[#F37021]" /> 
            <h3 className="text-2xl font-bold">Synthese Rapport: <span className="text-[#F37021]">{searchTag}</span></h3>
          </div>
          <div className="prose prose-invert max-w-none text-slate-200 leading-relaxed text-lg whitespace-pre-wrap font-serif">
            {activeSynthesis}
          </div>
        </div>
      )}

      {filteredHighlights.length === 0 ? (
        <div className="text-center py-32 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
          <Tag className="text-slate-300 mx-auto mb-4" size={48} />
          <h3 className="text-xl font-bold text-[#003B5C]">Geen fragmenten gevonden</h3>
          <p className="text-slate-500 mt-2 max-w-sm mx-auto">Zoek op een tag (bijv. 'feedback') of voeg in de Reader nieuwe annotaties toe.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredHighlights.map(h => (
            <div key={h.id} className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col hover:border-[#F37021] hover:shadow-md transition">
              <div className="flex justify-between items-start mb-4 border-b border-slate-100 pb-4">
                <span className="bg-[#F37021] text-white text-[10px] px-3 py-1 rounded-full uppercase font-black tracking-widest">{h.tag}</span>
                <span className="text-slate-400 text-[10px] font-bold max-w-[150px] truncate" title={h.docTitle}>
                   {h.docTitle}
                </span>
              </div>
              <blockquote className="border-l-4 border-[#003B5C]/10 pl-4 py-1 italic text-slate-700 text-sm leading-relaxed mb-4 flex-1">
                "{h.text}"
              </blockquote>
              {h.comment && (
                <div className="bg-slate-50 p-3 rounded-lg mt-auto mb-4 text-xs">
                  <span className="font-bold text-[#003B5C] block mb-1">Jouw Notitie:</span>
                  <span className="text-slate-600">{h.comment}</span>
                </div>
              )}
              <button 
                onClick={() => { 
                  const doc = documents.find(d => d.id === h.docId);
                  if(doc) {
                    setSelectedDoc(doc);
                    setActiveHighlightId(h.id);
                    setView('reader');
                    setRightPanelTab('annotations');
                  }
                }}
                className="w-full text-center py-2.5 bg-[#003B5C]/5 text-[#003B5C] rounded-lg text-xs font-bold hover:bg-[#003B5C] hover:text-white transition"
              >
                Naar de bron
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans selection:bg-[#F37021]/30">
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 20px; }
      `}} />

      {/* DYNAMISCHE ZIJBALK NAVIGATIE: klapt in (w-20) tijdens het lezen, anders w-64 */}
      <div className={`bg-[#003B5C] flex flex-col transition-all duration-300 ease-in-out z-20 shadow-2xl shrink-0 ${isReaderView ? 'w-20' : 'w-64'}`}>
        <div className={`py-8 mb-6 flex items-center bg-[#002b44] transition-all duration-300 ${isReaderView ? 'px-0 justify-center' : 'px-6 gap-4'}`}>
          <div className="bg-[#F37021] p-3 rounded-xl text-white shadow-lg shrink-0">
            <BookOpen size={28} strokeWidth={2.5} />
          </div>
          
          {/* Tekst wordt onzichtbaar als de balk inklapt */}
          {!isReaderView && (
            <div className="text-white overflow-hidden whitespace-nowrap animate-in fade-in duration-300">
              <h1 className="font-black text-xl tracking-tight leading-none">WIJZE LESSEN</h1>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-2">EcOL Editie</p>
            </div>
          )}
        </div>

        <nav className="flex-1 space-y-2 px-4">
          <button 
            onClick={() => { setView('library'); setActiveHighlightId(null); }}
            title="Bouwstenen"
            className={`w-full flex items-center rounded-xl transition-all ${isReaderView ? 'justify-center p-4' : 'px-6 py-4 gap-4'} ${view === 'library' || view === 'reader' ? 'bg-[#F37021] text-white shadow-md font-bold' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}
          >
            <Layers size={22} className="shrink-0" />
            {!isReaderView && <span className="block text-sm whitespace-nowrap overflow-hidden">Bouwstenen</span>}
          </button>
          
          <button 
            onClick={() => setView('tags')}
            title="Annotaties"
            className={`w-full flex items-center rounded-xl transition-all ${isReaderView ? 'justify-center p-4' : 'px-6 py-4 gap-4'} ${view === 'tags' ? 'bg-[#F37021] text-white shadow-md font-bold' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}
          >
            <Tag size={22} className="shrink-0" />
            {!isReaderView && <span className="block text-sm whitespace-nowrap overflow-hidden">Annotaties</span>}
          </button>
        </nav>

        <div className={`mt-auto p-6 border-t border-white/10 bg-[#002b44] transition-all duration-300 ${isReaderView ? 'flex justify-center px-0' : ''}`}>
           <div className={`flex items-center gap-3 ${isReaderView ? 'mb-0' : 'mb-2'}`}>
             <div className="w-2 h-2 rounded-full bg-green-400 shrink-0" title="Data gesynchroniseerd"></div>
             {!isReaderView && <p className="text-xs font-bold text-white whitespace-nowrap overflow-hidden">Data gesynchroniseerd</p>}
           </div>
           {!isReaderView && <p className="text-[10px] text-slate-400 leading-tight whitespace-nowrap overflow-hidden">Je documenten worden bewaard.</p>}
        </div>
      </div>

      <main className="flex-1 overflow-hidden relative bg-slate-50">
        {view === 'library' && <div className="h-full overflow-y-auto custom-scrollbar"><LibraryView /></div>}
        {view === 'reader' && <ReaderView />}
        {view === 'tags' && <TagExplorerView />}
      </main>
    </div>
  );
}