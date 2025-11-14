import { BrowserRouter as Router, Routes, Route } from "react-router";
import './App.css'
import * as Page from "./pages";
import * as Comp from "./components";

function App() {
  return (
    <>
      <Comp.Nav />
      <Routes>
        <Route path="/" element={<Page.Landing />} />
        <Route path="/home" element={<Page.Home />} />
        <Route path="/learn" element={<Page.Learn />} />
        <Route path="/chat" element={<Page.Messages />} />
      </Routes>
    </>
  )
}

export default App
